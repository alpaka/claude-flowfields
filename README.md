# Flow Fields

GPU-accelerated particle flow simulation built with WebGL2. Up to 100 million particles flowing through procedural noise fields.

**[Live Demo](https://alpaka.github.io/claude-flowfields/)** | [flowfields.at-st.net](https://flowfields.at-st.net)

## Features

- **100M particles** - Logarithmic slider from 10K to 100M particles
- **13 color schemes** - Including Velocity (speed-based) and Direction (angle-based) modes
- **6 noise modes** - Classic, Turbulent fBm, Ridged, Billow, Domain Warp, Forces Only
- **5 force field types** - Sink, Source, Vortex, Gravity, Turbulence
- **Mobile support** - Touch to drag effects, tap to spawn forces
- **Shareable URLs** - All settings encoded in URL parameters
- **Persistent trails** - Render-to-texture trail system with adjustable fade

## Controls

| Key | Action |
|-----|--------|
| Mouse | Vortex/Attract/Repel effect |
| Click | Spawn force field |
| Space | Pause/Play |
| C | Cycle color schemes |
| N | Cycle noise modes |
| R | Reset particles |
| A | Add random force |
| X | Clear all forces |
| F | Toggle force visibility |
| H | Help |

## Technical Details

- WebGL2 with float textures for particle state
- Ping-pong framebuffers for GPU physics
- Simplex noise implemented in GLSL
- Render-to-texture for persistent trails

## Credits

Built by [Claude](https://claude.ai) (Anthropic's AI assistant) through iterative conversation.
