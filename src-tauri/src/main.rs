// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMA-BUF renderer crashes with "Error 71 (Protocol error)
    // dispatching to Wayland display" on the NVIDIA proprietary driver under
    // Wayland (a widely-reported WebKitGTK/NVIDIA interaction, not specific
    // to this app — hit identically in mc-launcher and rgb-control-center on
    // this machine). Must be set before GTK/WebKit initialize, so it happens
    // here rather than in `lib::run()`.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    omarchy_player_lib::run()
}
