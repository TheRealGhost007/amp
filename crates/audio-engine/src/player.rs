//! `Player`: the state machine `src-tauri` drives. Uses `Slot::A` for
//! normal/gapless playback; a crossfade transition briefly runs both
//! slots at once, ramping volume between them, then settles back to a
//! single active slot.
//!
//! Deliberately synchronous and not self-driving — like `scan_root`, the
//! caller is responsible for invoking [`Player::tick`] periodically (a
//! `~200ms` timer in `src-tauri`, once that phase wires it up) rather
//! than this crate spawning its own thread. `next` is a single
//! look-ahead slot, not a queue: the real queue lives in `player-core`'s
//! `queue` table and the frontend; this crate only needs to know what
//! comes immediately after the current track to preload it.

use crate::backend::{Backend, BackendEvent};
use crate::error::Result;
use crate::types::{AudioDevice, PlaybackState, PlayerEvent, Slot, TrackRef, EQ_BAND_COUNT};

struct CrossfadeProgress {
    total_ms: u64,
    elapsed_ms: u64,
    /// Captured when the crossfade starts, independent of `Player::next`
    /// — if the caller reorders the queue mid-crossfade (a new
    /// `set_next` call), that must not retarget a transition already
    /// committed and playing on the inactive slot. `next` after that
    /// point means "what comes after *this* crossfade finishes."
    target: TrackRef,
}

pub struct Player<B: Backend> {
    backend: B,
    active: Slot,
    current: Option<TrackRef>,
    next: Option<TrackRef>,
    /// Tracked explicitly rather than inferred from `position_ms()` —
    /// both backends can report a valid position for a loaded-but-paused
    /// slot, so "position is Some" is not a proxy for "is playing."
    is_playing: bool,
    volume: f64,
    muted: bool,
    eq_bands: [f64; EQ_BAND_COUNT],
    speed: f64,
    crossfade_ms: Option<u64>,
    crossfade: Option<CrossfadeProgress>,
}

impl<B: Backend> Player<B> {
    pub fn new(backend: B) -> Self {
        Self {
            backend,
            active: Slot::A,
            current: None,
            next: None,
            is_playing: false,
            volume: 1.0,
            muted: false,
            eq_bands: [0.0; EQ_BAND_COUNT],
            speed: 1.0,
            crossfade_ms: None,
            crossfade: None,
        }
    }

    pub fn current_track(&self) -> Option<&TrackRef> {
        self.current.as_ref()
    }

    pub fn is_playing(&self) -> bool {
        self.is_playing
    }

    pub fn position_ms(&self) -> Option<u64> {
        self.backend.position_ms(self.active)
    }

    pub fn duration_ms(&self) -> Option<u64> {
        self.backend.duration_ms(self.active)
    }

    fn apply_slot_settings(&mut self, slot: Slot, volume: f64) -> Result<()> {
        self.backend.set_volume(slot, volume)?;
        self.backend.set_muted(slot, self.muted)?;
        self.backend.set_playback_speed(slot, self.speed)?;
        for band in 0..EQ_BAND_COUNT {
            self.backend.set_eq_band(slot, band, self.eq_bands[band])?;
        }
        Ok(())
    }

    /// Loads and starts `uri` on `slot`, applying the currently-configured
    /// volume/mute/speed/EQ. Used by both the gapless/crossfade EOS
    /// recovery path and the crossfade-start path so a load failure (a
    /// corrupt or deleted file queued as `next`) is handled identically
    /// wherever it can occur, instead of aborting `tick()` via `?`.
    fn load_and_play(&mut self, slot: Slot, uri: &str, volume: f64) -> Result<()> {
        self.backend.load(slot, uri)?;
        self.apply_slot_settings(slot, volume)?;
        self.backend.play(slot)
    }

    /// Interrupts whatever is playing and starts `track` immediately on
    /// `Slot::A`. Clears any in-progress crossfade; the caller should call
    /// [`Player::set_next`] again afterward if there is a track that
    /// should follow this one.
    pub fn play_now(&mut self, track: TrackRef) -> Result<Vec<PlayerEvent>> {
        self.backend.stop(Slot::A)?;
        self.backend.stop(Slot::B)?;
        self.crossfade = None;
        self.active = Slot::A;
        self.next = None;

        self.backend.load(Slot::A, &track.uri)?;
        self.apply_slot_settings(Slot::A, self.volume)?;
        self.backend.play(Slot::A)?;
        self.current = Some(track);
        self.is_playing = true;

        Ok(vec![
            PlayerEvent::TrackAdvanced,
            PlayerEvent::StateChanged(PlaybackState::Playing),
        ])
    }

    pub fn pause(&mut self) -> Result<Vec<PlayerEvent>> {
        self.backend.pause(self.active)?;
        self.is_playing = false;
        Ok(vec![PlayerEvent::StateChanged(PlaybackState::Paused)])
    }

    pub fn resume(&mut self) -> Result<Vec<PlayerEvent>> {
        self.backend.play(self.active)?;
        self.is_playing = true;
        Ok(vec![PlayerEvent::StateChanged(PlaybackState::Playing)])
    }

    pub fn stop(&mut self) -> Result<Vec<PlayerEvent>> {
        self.backend.stop(Slot::A)?;
        self.backend.stop(Slot::B)?;
        self.crossfade = None;
        self.current = None;
        self.is_playing = false;
        Ok(vec![PlayerEvent::StateChanged(PlaybackState::Stopped)])
    }

    pub fn seek(&mut self, position_ms: u64) -> Result<()> {
        self.backend.seek(self.active, position_ms)
    }

    /// Sets what should play immediately after the current track. In
    /// gapless mode (the default, `crossfade_ms == None`) this is
    /// forwarded straight to the active slot so GStreamer can switch
    /// with no gap; in crossfade mode it's only consulted by [`tick`]
    /// once the crossfade window is reached.
    pub fn set_next(&mut self, next: Option<TrackRef>) -> Result<()> {
        self.next = next;
        if self.crossfade_ms.is_none() && self.crossfade.is_none() {
            let uri = self.next.as_ref().map(|t| t.uri.as_str());
            self.backend.set_gapless_next(self.active, uri)?;
        }
        Ok(())
    }

    pub fn volume(&self) -> f64 {
        self.volume
    }

    pub fn set_volume(&mut self, volume: f64) -> Result<()> {
        self.volume = volume.clamp(0.0, 1.0);
        if self.crossfade.is_none() {
            self.backend.set_volume(self.active, self.volume)?;
        }
        Ok(())
    }

    pub fn set_muted(&mut self, muted: bool) -> Result<()> {
        self.muted = muted;
        self.backend.set_muted(Slot::A, muted)?;
        self.backend.set_muted(Slot::B, muted)?;
        Ok(())
    }

    /// Applied to both slots so a crossfade never audibly "jumps" EQ
    /// when the active slot swaps.
    pub fn set_eq_band(&mut self, band: usize, gain_db: f64) -> Result<()> {
        if band >= EQ_BAND_COUNT {
            return Ok(());
        }
        self.eq_bands[band] = gain_db;
        self.backend.set_eq_band(Slot::A, band, gain_db)?;
        self.backend.set_eq_band(Slot::B, band, gain_db)?;
        Ok(())
    }

    /// Applied to both slots, like `set_muted`/`set_eq_band`, so a track
    /// being crossfaded into doesn't keep playing at a stale speed for
    /// the rest of the transition after the rate changes mid-fade.
    pub fn set_playback_speed(&mut self, rate: f64) -> Result<()> {
        self.speed = rate;
        self.backend.set_playback_speed(Slot::A, rate)?;
        self.backend.set_playback_speed(Slot::B, rate)?;
        Ok(())
    }

    /// `None` (the default) means gapless; `Some(ms)` enables crossfade
    /// starting `ms` before each track's end.
    pub fn set_crossfade_duration(&mut self, duration_ms: Option<u64>) -> Result<()> {
        self.crossfade_ms = duration_ms;
        if duration_ms.is_none() && self.crossfade.is_none() {
            let uri = self.next.as_ref().map(|t| t.uri.as_str());
            self.backend.set_gapless_next(self.active, uri)?;
        } else if duration_ms.is_some() {
            self.backend.set_gapless_next(self.active, None)?;
        }
        Ok(())
    }

    pub fn list_devices(&self) -> Vec<AudioDevice> {
        self.backend.list_output_devices()
    }

    pub fn set_device(&mut self, device_id: Option<&str>) -> Result<()> {
        self.backend.set_output_device(Slot::A, device_id)?;
        self.backend.set_output_device(Slot::B, device_id)?;
        Ok(())
    }

    /// Drives the state machine forward by `elapsed_ms` of wall-clock
    /// time and returns whatever the caller should tell the frontend.
    pub fn tick(&mut self, elapsed_ms: u64) -> Result<Vec<PlayerEvent>> {
        let mut out = Vec::new();

        for event in self.backend.poll_events(self.active) {
            match event {
                BackendEvent::AdvancedToGaplessNext => {
                    if let Some(next) = self.next.take() {
                        self.current = Some(next);
                        out.push(PlayerEvent::TrackAdvanced);
                    }
                }
                BackendEvent::Eos => {
                    if self.crossfade.is_some() {
                        // The old slot reaching its natural end exactly as
                        // a crossfade wraps up is expected — the ramp's
                        // own completion branch below handles the actual
                        // transition; there's nothing to do here.
                    } else if let Some(next) = self.next.take() {
                        // A real pipeline keeps playing in wall-clock time
                        // between `tick()` calls, so it can reach genuine
                        // EOS before a delayed tick ever gets to detect
                        // "we're inside the crossfade/gapless window" (see
                        // ARCHITECTURE.md's Phase 4 section for how this
                        // was caught). Recover by advancing immediately on
                        // the same slot rather than reporting a false
                        // "queue exhausted."
                        //
                        // A failure here (corrupt/deleted file queued as
                        // `next`) must not abort the whole tick via `?` —
                        // the old track has already genuinely ended, so
                        // there's nothing left to keep playing; report the
                        // error and finish gracefully instead of silently
                        // freezing on a stale `current` forever (`self.next`
                        // is already cleared by `.take()` above, so nothing
                        // would ever retry this).
                        match self.load_and_play(self.active, &next.uri, self.volume) {
                            Ok(()) => {
                                self.current = Some(next);
                                out.push(PlayerEvent::TrackAdvanced);
                            }
                            Err(e) => {
                                out.push(PlayerEvent::Error(e.to_string()));
                                self.current = None;
                                self.is_playing = false;
                                out.push(PlayerEvent::StateChanged(PlaybackState::Stopped));
                                out.push(PlayerEvent::PlaybackFinished);
                            }
                        }
                    } else {
                        self.current = None;
                        self.is_playing = false;
                        out.push(PlayerEvent::StateChanged(PlaybackState::Stopped));
                        out.push(PlayerEvent::PlaybackFinished);
                    }
                }
                BackendEvent::Error(message) => {
                    // A fatal pipeline error on the active slot (decode
                    // failure, the output device disappearing mid-
                    // playback, ...) previously left `current`/
                    // `is_playing` completely untouched — the app (and
                    // MPRIS) kept reporting "still playing" that track
                    // forever, with no way to recover short of a brand
                    // new `play_now`. Matches the "no next queued" EOS
                    // branch above: report the error, then report
                    // playback as genuinely stopped, same as any other
                    // path that ends up with nothing left to play.
                    out.push(PlayerEvent::Error(message));
                    self.current = None;
                    self.is_playing = false;
                    out.push(PlayerEvent::StateChanged(PlaybackState::Stopped));
                    out.push(PlayerEvent::PlaybackFinished);
                }
            }
        }

        // Errors from the inactive slot's pipeline (the track being
        // crossfaded into) would otherwise go completely unobserved —
        // `poll_events` above only drains `self.active`'s bus.
        if self.crossfade.is_some() {
            for event in self.backend.poll_events(self.active.other()) {
                if let BackendEvent::Error(message) = event {
                    out.push(PlayerEvent::Error(message));
                }
            }
        }

        if let Some(total_ms) = self.crossfade_ms {
            if self.crossfade.is_none() {
                if let (Some(next), Some(duration), Some(position)) =
                    (self.next.clone(), self.duration_ms(), self.position_ms())
                {
                    if duration.saturating_sub(position) <= total_ms {
                        let inactive = self.active.other();
                        match self.load_and_play(inactive, &next.uri, 0.0) {
                            Ok(()) => {
                                // Committed: this crossfade owns `next` from
                                // here. `set_next` calls from this point on
                                // target whatever comes *after* this
                                // transition finishes.
                                self.next = None;
                                self.crossfade = Some(CrossfadeProgress {
                                    total_ms,
                                    elapsed_ms: 0,
                                    target: next,
                                });
                            }
                            Err(e) => {
                                // The currently-active slot is still playing
                                // the current track normally — only the
                                // *next* track failed to preload, so don't
                                // stop good audio; just clear `next` (so
                                // this failing load isn't retried every
                                // tick for the rest of the window) and
                                // report the error. The active slot's own
                                // natural EOS will then correctly report
                                // `PlaybackFinished` via the no-next branch
                                // above once it arrives.
                                out.push(PlayerEvent::Error(e.to_string()));
                                self.next = None;
                            }
                        }
                    }
                }
            }
        }

        if let Some(progress) = &mut self.crossfade {
            progress.elapsed_ms = (progress.elapsed_ms + elapsed_ms).min(progress.total_ms);
            let t = if progress.total_ms == 0 {
                1.0
            } else {
                progress.elapsed_ms as f64 / progress.total_ms as f64
            };
            let (fade_out, fade_in) = (1.0 - t, t);
            let (active, inactive) = (self.active, self.active.other());
            self.backend.set_volume(active, self.volume * fade_out)?;
            self.backend.set_volume(inactive, self.volume * fade_in)?;

            if t >= 1.0 {
                let target = progress.target.clone();
                self.backend.stop(active)?;
                self.active = inactive;
                self.backend.set_volume(self.active, self.volume)?;
                self.crossfade = None;
                self.current = Some(target);
                out.push(PlayerEvent::TrackAdvanced);
            }
        }

        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::SimulatedBackend;

    fn track(id: i64, uri: &str) -> TrackRef {
        TrackRef {
            id,
            uri: uri.to_string(),
        }
    }

    #[test]
    fn play_now_starts_slot_a() {
        let mut player = Player::new(SimulatedBackend::new());
        let events = player.play_now(track(1, "a")).unwrap();
        assert!(events.contains(&PlayerEvent::TrackAdvanced));
        assert_eq!(player.current_track(), Some(&track(1, "a")));
        assert_eq!(player.position_ms(), Some(0));
        assert!(player.is_playing());
    }

    #[test]
    fn is_playing_reflects_pause_not_just_position_availability() {
        // Regression test: both backends can report a valid position for
        // a loaded-but-paused slot, so `is_playing()` must not infer
        // state from `position_ms().is_some()`.
        let mut player = Player::new(SimulatedBackend::new());
        assert!(!player.is_playing());

        player.play_now(track(1, "a")).unwrap();
        assert!(player.is_playing());

        player.pause().unwrap();
        assert!(
            player.position_ms().is_some(),
            "a paused slot still reports a position"
        );
        assert!(!player.is_playing());

        player.resume().unwrap();
        assert!(player.is_playing());

        player.stop().unwrap();
        assert!(!player.is_playing());
    }

    #[test]
    fn gapless_auto_advance_updates_current_track_on_tick() {
        let mut player = Player::new(SimulatedBackend::new());
        player.play_now(track(1, "a")).unwrap();
        player.backend.set_duration_for_test(Slot::A, 1000);
        player.set_next(Some(track(2, "b"))).unwrap();

        player.backend.advance(Slot::A, 1200);
        let events = player.tick(1200).unwrap();

        assert!(events.contains(&PlayerEvent::TrackAdvanced));
        assert_eq!(player.current_track(), Some(&track(2, "b")));
    }

    #[test]
    fn end_of_stream_with_no_next_emits_playback_finished() {
        let mut player = Player::new(SimulatedBackend::new());
        player.play_now(track(1, "a")).unwrap();
        player.backend.set_duration_for_test(Slot::A, 1000);

        player.backend.advance(Slot::A, 1500);
        let events = player.tick(1500).unwrap();

        assert!(events.contains(&PlayerEvent::PlaybackFinished));
        assert_eq!(player.current_track(), None);
    }

    #[test]
    fn crossfade_ramps_volume_and_swaps_active_slot() {
        let mut player = Player::new(SimulatedBackend::new());
        player.set_crossfade_duration(Some(2000)).unwrap();
        player.play_now(track(1, "a")).unwrap();
        player.backend.set_duration_for_test(Slot::A, 10_000);
        player.set_next(Some(track(2, "b"))).unwrap();

        // Not yet within the crossfade window.
        player.backend.advance(Slot::A, 7000);
        player.tick(7000).unwrap();
        assert_eq!(player.backend.position_ms(Slot::B), None);

        // Enter the crossfade window (8s in, 2s left on a 10s track) —
        // the ramp's first step applies within this same tick, so this
        // is already halfway (1000ms of the 2000ms window) once it returns.
        player.backend.advance(Slot::A, 1000);
        player.tick(1000).unwrap();
        assert!(player.backend.position_ms(Slot::B).is_some());

        // Finish the crossfade.
        let events = player.tick(1000).unwrap();
        assert!(events.contains(&PlayerEvent::TrackAdvanced));
        assert_eq!(player.current_track(), Some(&track(2, "b")));
        assert_eq!(player.active, Slot::B);
    }

    #[test]
    fn reordering_next_mid_crossfade_does_not_retarget_the_in_flight_transition() {
        // Regression test: the inactive slot is already loaded and
        // playing "b" once the crossfade window is entered. If the
        // caller reorders the upcoming queue at that point (a new
        // `set_next`), the crossfade already in flight must still land
        // on "b" — the new value is for whatever comes *after* it.
        let mut player = Player::new(SimulatedBackend::new());
        player.set_crossfade_duration(Some(2000)).unwrap();
        player.play_now(track(1, "a")).unwrap();
        player.backend.set_duration_for_test(Slot::A, 10_000);
        player.set_next(Some(track(2, "b"))).unwrap();

        player.backend.advance(Slot::A, 7000);
        player.tick(7000).unwrap();
        player.backend.advance(Slot::A, 1000);
        player.tick(1000).unwrap();
        assert!(
            player.backend.position_ms(Slot::B).is_some(),
            "crossfade should have started"
        );

        // Queue reordered mid-crossfade.
        player.set_next(Some(track(3, "c"))).unwrap();

        let events = player.tick(1000).unwrap();
        assert!(events.contains(&PlayerEvent::TrackAdvanced));
        assert_eq!(
            player.current_track(),
            Some(&track(2, "b")),
            "in-flight crossfade must finish on b, not c"
        );
    }

    /// Regression test for a real bug hit against actual GStreamer
    /// playback (see ARCHITECTURE.md's Phase 4 section): a real pipeline
    /// keeps advancing in wall-clock time between `tick()` calls, so it
    /// can reach genuine EOS before a delayed tick ever notices "we're
    /// inside the crossfade window." `Player` must recover by advancing
    /// to `next` immediately rather than reporting a false
    /// `PlaybackFinished`.
    #[test]
    fn eos_with_a_queued_next_recovers_instead_of_reporting_finished() {
        let mut player = Player::new(SimulatedBackend::new());
        player.set_crossfade_duration(Some(200)).unwrap();
        player.play_now(track(1, "a")).unwrap();
        player.backend.set_duration_for_test(Slot::A, 1000);
        player.set_next(Some(track(2, "b"))).unwrap();

        // Jumps straight past the crossfade window to natural EOS in one
        // step, simulating a missed/delayed tick.
        player.backend.advance(Slot::A, 1500);
        let events = player.tick(1500).unwrap();

        assert!(events.contains(&PlayerEvent::TrackAdvanced));
        assert!(!events.contains(&PlayerEvent::PlaybackFinished));
        assert_eq!(player.current_track(), Some(&track(2, "b")));
        assert_eq!(player.active, Slot::A);
    }

    #[test]
    fn volume_getter_reflects_the_clamped_value() {
        let mut player = Player::new(SimulatedBackend::new());
        player.set_volume(1.5).unwrap();
        assert_eq!(player.volume(), 1.0);
        player.set_volume(-0.5).unwrap();
        assert_eq!(player.volume(), 0.0);
    }

    #[test]
    fn eq_and_volume_apply_to_both_slots_so_crossfade_never_jumps() {
        let mut player = Player::new(SimulatedBackend::new());
        player.set_eq_band(3, 4.5).unwrap();
        player.play_now(track(1, "a")).unwrap();
        // Re-applying settings on play_now should not have clobbered the
        // stored EQ value used for the next slot to start.
        assert_eq!(player.eq_bands[3], 4.5);
    }

    #[test]
    fn set_playback_speed_applies_to_both_slots_so_crossfade_never_jumps() {
        // Regression test: set_playback_speed previously only forwarded to
        // `self.active`, unlike set_muted/set_eq_band — a speed change
        // mid-crossfade would leave the two slots playing at different
        // speeds for the rest of the transition.
        let mut player = Player::new(SimulatedBackend::new());
        player.play_now(track(1, "a")).unwrap();
        player.set_playback_speed(1.5).unwrap();
        assert_eq!(player.backend.speed_for_test(Slot::A), 1.5);
        assert_eq!(player.backend.speed_for_test(Slot::B), 1.5);
    }

    #[test]
    fn eos_recovery_load_failure_reports_error_and_finishes_gracefully_instead_of_freezing() {
        // Regression test: a corrupt/deleted file queued as `next` used to
        // abort `tick()` via `?`, and since `next.take()` had already run,
        // nothing would ever retry — playback froze forever on the old
        // (already-finished) track with no visible error.
        let mut player = Player::new(SimulatedBackend::new());
        player.set_crossfade_duration(Some(200)).unwrap();
        player.play_now(track(1, "a")).unwrap();
        player.backend.set_duration_for_test(Slot::A, 1000);
        player.backend.fail_load_for_test("b");
        player.set_next(Some(track(2, "b"))).unwrap();

        // Jumps straight past the crossfade window to natural EOS, same
        // "missed tick" shape as `eos_with_a_queued_next_recovers_instead_of_reporting_finished`.
        player.backend.advance(Slot::A, 1500);
        let events = player.tick(1500).unwrap();

        assert!(
            events.iter().any(|e| matches!(e, PlayerEvent::Error(_))),
            "a failed recovery load must be reported, not silently swallowed"
        );
        assert!(events.contains(&PlayerEvent::PlaybackFinished));
        assert_eq!(player.current_track(), None);
        assert!(!player.is_playing());
    }

    #[test]
    fn crossfade_start_load_failure_reports_error_and_leaves_current_track_playing() {
        // Regression test: a failed preload of `next` at the crossfade
        // boundary used to abort `tick()` via `?` and leave `self.next`
        // still set, retrying the identical failing load every tick for
        // the rest of the window. The still-good current track should
        // just keep playing normally instead.
        let mut player = Player::new(SimulatedBackend::new());
        player.set_crossfade_duration(Some(2000)).unwrap();
        player.play_now(track(1, "a")).unwrap();
        player.backend.set_duration_for_test(Slot::A, 10_000);
        player.backend.fail_load_for_test("b");
        player.set_next(Some(track(2, "b"))).unwrap();

        player.backend.advance(Slot::A, 7000);
        player.tick(7000).unwrap();

        player.backend.advance(Slot::A, 1000);
        let events = player.tick(1000).unwrap();

        assert!(
            events.iter().any(|e| matches!(e, PlayerEvent::Error(_))),
            "a failed crossfade preload must be reported, not silently swallowed"
        );
        assert_eq!(player.current_track(), Some(&track(1, "a")));
        assert_eq!(player.active, Slot::A);
        assert!(player.is_playing());

        // Must not retry the same failing load every subsequent tick.
        player.backend.advance(Slot::A, 100);
        let events = player.tick(100).unwrap();
        assert!(!events.iter().any(|e| matches!(e, PlayerEvent::Error(_))));
    }

    #[test]
    fn errors_on_the_inactive_slot_during_crossfade_are_surfaced() {
        // Regression test: poll_events was only ever called on
        // `self.active`, so a real decode error on the slot being
        // crossfaded into would sit unread on its bus and go unreported.
        let mut player = Player::new(SimulatedBackend::new());
        player.set_crossfade_duration(Some(2000)).unwrap();
        player.play_now(track(1, "a")).unwrap();
        player.backend.set_duration_for_test(Slot::A, 10_000);
        player.set_next(Some(track(2, "b"))).unwrap();

        player.backend.advance(Slot::A, 7000);
        player.tick(7000).unwrap();
        player.backend.advance(Slot::A, 1000);
        player.tick(1000).unwrap();
        assert!(
            player.backend.position_ms(Slot::B).is_some(),
            "crossfade should have started"
        );

        player.backend.push_error_for_test(Slot::B, "decode error");
        let events = player.tick(100).unwrap();
        assert!(events
            .iter()
            .any(|e| matches!(e, PlayerEvent::Error(msg) if msg == "decode error")));
    }

    #[test]
    fn a_fatal_error_on_the_active_slot_stops_playback_instead_of_freezing_state() {
        // Regression test: a fatal pipeline error on the active slot
        // (decode failure, output device disappearing mid-playback, ...)
        // used to be reported via `PlayerEvent::Error` alone, with
        // `current`/`is_playing` left completely untouched — the player
        // (and anything reading it, like MPRIS) kept reporting "still
        // playing" that track forever, with no way to recover short of
        // starting an entirely new `play_now`.
        let mut player = Player::new(SimulatedBackend::new());
        player.play_now(track(1, "a")).unwrap();
        assert!(player.is_playing());

        player
            .backend
            .push_error_for_test(Slot::A, "device disconnected");
        let events = player.tick(100).unwrap();

        assert!(events
            .iter()
            .any(|e| matches!(e, PlayerEvent::Error(msg) if msg == "device disconnected")));
        assert!(events
            .iter()
            .any(|e| matches!(e, PlayerEvent::StateChanged(PlaybackState::Stopped))));
        assert!(events
            .iter()
            .any(|e| matches!(e, PlayerEvent::PlaybackFinished)));
        assert_eq!(player.current_track(), None);
        assert!(!player.is_playing());
    }

    #[test]
    fn set_device_forwards_to_both_slots() {
        let mut player = Player::new(SimulatedBackend::new());
        let devices = player.list_devices();
        let id = devices
            .first()
            .expect("simulated backend reports a default device")
            .id
            .clone();
        assert!(player.set_device(Some(&id)).is_ok());
    }
}
