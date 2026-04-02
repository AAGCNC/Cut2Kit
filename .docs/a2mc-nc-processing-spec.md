# A2MC NC Processing Specification

## 1. Purpose
This document defines how AXYZ A2MC ingests, verifies, interprets, and executes NC files so Cut2Kit can generate output that matches the actual controller behavior.

The focus is the real runtime path from the operator pressing `Start`, through verification and queueing, into execution, pause/resume, and end-of-program cleanup. All claims below are derived from repository code, not generic CNC assumptions.

Primary evidence:

- `A2MCSource/HostMain.cs::runJobDirectly`, `A2MCSource/HostMain.cs::RunHostThread`
- `A2MCSource/NCParser.cs::StartPushed`, `ProcessStartPushedProcedure`, `StartTwo`, `ProcessCurrentNCFile`, `ProcessNCLine`, `ProcessGCode`, `MoveMachine`, `DoRealMotion`, `EndNicelyProcedure`
- `A2MCSource/MCodes.cs::DoThisM`, `RunMCode`, `ToolONOFF`, `ValidateSpindleRpmLimitsForVerification`
- `A2MCSource/NCSearcher.cs::PrepareToStart`, `JumpToSubroutine`, `FindNCLineNumber`
- `A2MC_CE/MCodeImplementations.cs::mcodeM0M1Pause`
- `A2MC_CE/Labeler/Labeler.cs`, `A2MC_CE/Labeler/process/LabelerSendLabel.cs`
- `A2MC_CE/MaterialHandling/PushOffBar.cs`, `A2MC_CE/MaterialHandling/DragOnLoader.cs`

## 2. Scope and confidence
Inspected code areas:

- Start and host-loop entry: `A2MCSource/Program.cs`, `A2MCSource/A2MotionController.cs`, `A2MCSource/A2MC.cs`, `A2MCSource/HostMain.cs`
- NC parse/execute path: `A2MCSource/NCParser.cs`, `A2MCSource/NCSearcher.cs`, `A2MCSource/CannedCycles.cs`
- M-code and device dispatch: `A2MCSource/MCodes.cs`, `A2MC_CE/MCodeImplementations.cs`
- Motion handoff: `MotionLib/MotionLib/NewMotionCard.cs`, `MotionLib/MotionLib/TrajManager.cs`
- Labeler and material handling: `A2MC_CE/Labeler/*`, `A2MC_CE/MaterialHandling/*`

Confidence:

- High: start lifecycle, verify flow, parser tokenization, modal state, G0/G1/G2/G3/G4 handling, tool change, spindle handling, pause/resume, M30/end-of-job cleanup, labeler M272/M273, material handling M280/M281/M282.
- Medium: canned cycles G81-G84, AVS/vision-specific behavior, saw-specific branches, restricted-zone reroutes. These were traced enough to understand control flow, but they are not the main Cut2Kit target.
- Low / intentionally avoided: behavior implemented only in external machine configuration, hardware firmware, or legacy Aussie/IO handlers not directly needed for a Cut2Kit first-pass post.

Important inferred boundaries:

- `G54` is enabled by default because `NCParser.EnableG54G28` is initialized `true` in `A2MCSource/NCParser.cs`, but that flag is still a runtime switch.
- `G20`/`G21` defaults before the first unit code come from `GetDistanceConversion()`, not from a hardcoded CNC default. In practice that means machine configuration decides the initial unit mode.
- Some parser-recognized codes are not truly executable. Example: `G85`-`G89` are accepted in `ProcessGCode`, but the canned-cycle runtime only implements `G81`-`G84`.

## 3. Start-to-execution lifecycle
### 3.1 Actual entrypoint
The operator `Start` key in the host loop enters through `A2MCSource/HostMain.cs::runJobDirectly`, which calls:

1. `a2mc.nc.ResetAllVScale()`
2. `a2mc.nc.StartPushed((int)key, false, "...")`

This is the real NC-start entrypoint for normal operator use.

### 3.2 The first `Start` does not immediately start cutting
On a fresh job, the first `Start` press runs `NCParser.StartPushed`, which performs setup and verification, then leaves the job queued in a ready state. Actual execution starts only after a second `Start` inside the queued/ready loop in `A2MCSource/NCParser.cs::ProcessStartPushedProcedure`.

Evidence:

- `A2MCSource/NCParser.cs::ProcessStartPushedProcedure`
- `A2MCSource/NCParser.cs` around the `"Press START"` / `"Ready"` loop
- `A2MCSource/NCParser.cs::StartTwo`

### 3.3 Fresh-start flow
When `PauseFlag == false`, `ProcessStartPushedProcedure` performs this sequence:

1. Tighten servos and capture startup flags.
2. Reset saw state via `sawParametersGlobal.resetSawParametersBetweenNCFiles()`.
3. Convert DSA files to NC if needed via `a2mc.rdy.ConvertDSAFile(CurrentNCFile)`.
4. Clear per-job state such as copy-tool position tracking, compensation state, job repeat counters, AVS resume flags, and contour counters.
5. Optionally run job alignment (`LocateRegMarks`) if enabled.
6. Optionally invert coordinates into a temporary inverted NC file if X or Y inversion is configured.
7. Verify the file:
   - Batch jobs verify every file first.
   - Normal jobs call `ProcessCurrentNCFile(true, ...)`.
   - If Move HMI control is active, normal verification is skipped for speed.
8. If verify fails, the operator may be prompted `Bypass Verify?`.
9. Optionally show job preview if `StartUpParams.JobStartPreview == 1`.
10. If machine auto-load is not active, turn AUTO vac/dust/zones on via `RunAuto(false, true, ...)`, then wait for vacuum and flow.
11. Run AVS/vision dot scanning via `a2mc.v.RunDots(...)`.
12. Enter the queued state and wait for a second `Start`.

Evidence:

- `A2MCSource/NCParser.cs::ProcessStartPushedProcedure`
- `A2MCSource/NCParser.cs::ProcessCurrentNCFile`
- `A2MCSource/FunctionExchange.cs::RunAuto`, `WaitForVacuum`, `WaitForFlow`
- `A2MCSource/VisionSystem.cs::RunDots`

### 3.4 Queued / ready state
After verification and pre-start machine checks, A2MC shows:

- `<file> Ready`
- or `<file> Shape N`
- or `<file> Sheet S.N` if `M70` sheet markers were found

It then waits for:

- `Start`: call `StartTwo(...)` and begin runtime execution
- `Stop`: cancel
- `Enter` / `+/-`: shape jump
- `File`: jump to `N` line number

Evidence:

- `A2MCSource/NCParser.cs::ProcessStartPushedProcedure`
- `A2MCSource/NCParser.cs::jumpShapeRoutine`
- `A2MCSource/NCSearcher.cs::FindNCLineNumber`

### 3.5 Barcode path
Barcode start is different. `ProcessStartPushedProcedure` skips the second-start wait when `barcodeStart == true` and returns `true`, and the barcode caller immediately invokes `StartTwo(...)`.

Evidence:

- `A2MCSource/HostMain.cs::JobStartFromBarcode`
- `A2MCSource/NCParser.cs::ProcessStartPushedProcedure`

### 3.6 Runtime start (`StartTwo`)
`StartTwo` is the true beginning of cutting/runtime side effects. It:

1. Optionally turns a delayed spindle back on if `turnOnSpindleOnStart` was set.
2. Logs start of job.
3. Prompts for repeat count if `JobRepeat > 1`.
4. Confirms roller/pulumdum material lengths when roller hold-down is enabled.
5. Waits for interlock clear.
6. Applies fast motion parameters.
7. For repeats/batch runs, optionally pauses between runs and re-runs `RunAuto`.
8. Calls `ProcessCurrentNCFile(false, ...)` for actual execution.

Evidence:

- `A2MCSource/NCParser.cs::StartTwo`

### 3.7 Resume path
When `PauseFlag == true` and `inkey == 0`, `ProcessStartPushedProcedure` runs the resume path:

1. Restore vision resume state if needed.
2. Re-align copy tools if required.
3. Wait for interlock, vacuum, and flow.
4. Require a valid saved pause position.
5. Move to safe Z / XY resume point.
6. Re-run `PrepareToStart(FileLineCount, ...)` to restore modal/tool state.
7. Restart plasma, mister, marker, or in-shape contour execution as needed.
8. Resume `ProcessCurrentNCFile(false, 0, FileLineCount, false)`.

Evidence:

- `A2MCSource/NCParser.cs::ProcessStartPushedProcedure`
- `A2MCSource/NCSearcher.cs::PrepareToStart`

## 4. NC file ingestion and parsing
### 4.1 File load path
The active job path is `NCParser.CurrentNCFile`. `ProcessCurrentNCFile` opens it with `FileStream`, `StreamReader`, and `ReadAheadStreamReader`, then processes it line-by-line.

Special cases:

- `.dxf` files bypass normal NC parsing and go to `a2mc.dxf.RunDXFJob(...)`.
- `.dsa` input may be converted to NC before verification/execution.
- configured axis inversion may create and run an `Inverted<filename>` NC file.

Evidence:

- `A2MCSource/NCParser.cs::ProcessCurrentNCFile`
- `A2MCSource/NCParser.cs::ProcessStartPushedProcedure`

### 4.2 Line model
A2MC does not build a rich block AST. It scans each raw line left-to-right in `ProcessNCLine`, updating shared modal state as it sees words.

This has real behavioral consequences:

- word ordering can matter
- multiple M codes on one line execute sequentially
- some words depend on an earlier word on the same line being seen first

Evidence:

- `A2MCSource/NCParser.cs::ProcessNCLine`

### 4.3 Comment and non-code handling
The parser treats these as non-code:

- `(` ... `)` nested comments
- `%`
- `:`
- `;`

Behavior:

- `(` increments a bracket depth and disables parsing until matching `)`.
- `%`, `:`, and `;` disable parsing for the rest of the line.
- `SpecialOps` still sees those markers and currently only uses them to detect `; CM2 G-CODE` for `FMTFlag`.

Evidence:

- `A2MCSource/NCParser.cs::ProcessNCLine`
- `A2MCSource/NCParser.cs::SpecialOps`

### 4.4 Case sensitivity
Only uppercase `A`-`Z` words are parsed. Lowercase letters are not recognized by the token scanner.

Evidence:

- `A2MCSource/NCParser.cs::ProcessNCLine`

### 4.5 Numeric parsing
`MakeNumber` accepts:

- digits
- `+`
- `-`
- `.`
- `,`
- spaces

Spaces inside a number are stripped.

`GetNCDouble` converts parsed numeric values to inches when `ModalMetric == true`, except for A-axis moves.

Evidence:

- `A2MCSource/NCParser.cs::MakeNumber`
- `A2MCSource/NCParser.cs::GetNCInt`
- `A2MCSource/NCParser.cs::GetNCGCode`
- `A2MCSource/NCParser.cs::GetNCDouble`

### 4.6 Error handling
Typical parse/runtime failure behavior:

- hard parse failures call `DisplayErrorCode(...)` and return `false`
- verify failures stop the verify pass and may prompt for bypass
- runtime failures fall into either pause/recoverable paths or stop/fault paths

Evidence:

- `A2MCSource/NCParser.cs::ProcessCurrentNCFile`
- `A2MCSource/NCParser.cs::ProcessNCLine`

## 5. Machine modal state model
Primary modal state lives in `NCParser.MODALSTUFF`.

### 5.1 Reset on fresh job
`InitializeModals()` resets these for a fresh parse:

- distance mode: absolute (`G90`)
- unit mode: machine-config default (`GetDistanceConversion`)
- plane: `G17`
- cutter compensation: machine auto-compensator default
- feed: active tool feed rate, or machine feed if tool feed is unset
- radial feed: A-axis max feed
- active tool: copied from `MCodes.ModalMCode.ActiveToolNum`
- spindle speed / spindle-on / mister-on: copied from `MCodes.ModalMCode`
- active origin: current `a2mc.mc.G_Origin`
- `G92` disabled
- canned cycles reset

Evidence:

- `A2MCSource/NCParser.cs::InitializeModals`
- `A2MCSource/NCParser.cs::ToolSetFeedRate`

### 5.2 Persistence
Line-to-line modal persistence:

- `G0/G1/G2/G3` motion mode persists
- `G20/G21` unit mode persists
- `G90/G91` distance mode persists
- `G17/G18/G19` plane persists
- `G40/G41/G42` cutter compensation mode persists
- `G54`-`G59` work offset persists by changing `a2mc.mc.G_Origin`
- `F` feed persists in `Modals.ModalF`
- `S` spindle speed persists in `Modals.ModalS`
- current tool persists in `Modals.ActiveToolNum` and also in `MCodes.ModalMCode.ActiveToolNum`
- spindle-on/mister-on modal state also persists in `MCodes.ModalMCode`

### 5.3 Important nonstandard details
- `G53` is treated as “select G54/origin 0”, not standard machine-coordinate mode.
- `G92` only affects X and Y offsets in practice. `G92ZOffset()` always returns `0`.
- `G92.2` disables G92.
- `InitializeO()` exists, but the normal start path does not call it; it is only used in vision dot scanning.

Evidence:

- `A2MCSource/NCParser.cs::ProcessGCode`
- `A2MCSource/NCParser.cs::G92XOffset`, `G92YOffset`, `G92ZOffset`
- `A2MCSource/VisionSystem.cs::RunDots`

## 6. G-code support matrix
| Code | Supported | Modal | Required params | Optional params | Execution effect | Validation notes | Post relevance | Code reference |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `G0` | Yes | Yes | target axis words as needed | `X Y Z A` | Rapid move; flushes current shape before `DoG0Move()` | Z-depth and boundary checks still apply; safe-G0 tracking updates elsewhere | High | `A2MCSource/NCParser.cs::ProcessGCode`, `DoRealMotion`, `DoG0Move` |
| `G1` | Yes | Yes | target axis words | `F` | Linear feed move | tiny moves may collapse; tool-specific validity checks apply | High | `A2MCSource/NCParser.cs::ProcessGCode`, `CheckForSignificance`, `DoShapeWrite` |
| `G2` | Yes | Yes | endpoint plus arc definition | `F`, `I J K`, `R`, `Z` for helix | CW arc | `A` axis forbidden; XY arcs over 180 degrees fault; radius-format is order-sensitive | High | `A2MCSource/NCParser.cs::ProcessGCode`, `ConvertRToIJK`, `SplitCircle`, `ArcLength` |
| `G3` | Yes | Yes | endpoint plus arc definition | `F`, `I J K`, `R`, `Z` for helix | CCW arc | same limits as `G2` | High | same as above |
| `G4` | Yes | One-shot | `P` on same line after `G4` | none | Dwell after flushing any buffered fragment | if `P` appears before `G4`, it is not treated as dwell time | High | `A2MCSource/NCParser.cs::ProcessGCode`, `ProcessNCLine` |
| `G17` | Yes | Yes | none | none | XY plane select | default plane | Medium | `A2MCSource/NCParser.cs::ProcessGCode` |
| `G18` | Yes | Yes | none | none | XZ plane select | parser supports it; downstream motion support is more limited than XY | Medium | same |
| `G19` | Yes | Yes | none | none | YZ plane select | same caution as `G18` | Medium | same |
| `G20` | Yes | Yes | none | none | inch mode | numeric values stop being divided by 25.4 | High | `A2MCSource/NCParser.cs::ProcessGCode`, `GetNCDouble` |
| `G21` | Yes | Yes | none | none | metric mode | parser converts subsequent numeric distance words to inches internally | High | same |
| `G28` | Yes | One-shot flag | none | none | home-to-user-origin move if runtime conditions allow | ignored in relative mode; gated by `EnableG54G28`; does nothing in verify | Medium | `A2MCSource/NCParser.cs::ProcessGCode`, `MoveMachine` |
| `G31` | Yes | One-shot | one axis search move | `F`, `R` | probing/search process | rejects positive Z search and multi-axis search | Low | `A2MCSource/NCParser.cs::ProcessGCode`, `A2MCSource/MCodes.cs::DoGProcess` |
| `G40` | Yes | Yes | none | none | cutter comp off | actual geometry delegated to compensation subsystem | Medium | `A2MCSource/NCParser.cs::ProcessGCode` |
| `G41` | Partial | Yes | motion after enable | `D` | cutter comp left | verify flags compensation detection; runtime delegated to comp subsystem | Medium | same |
| `G42` | Partial | Yes | motion after enable | `D` | cutter comp right | same as `G41` | Medium | same |
| `G43` | Accepted no-op | No meaningful effect | none | none | no runtime action | do not rely on it | Low | same |
| `G49` | Accepted no-op | No meaningful effect | none | none | no runtime action | do not rely on it | Low | same |
| `G50` | Accepted no-op | No meaningful effect | none | none | no runtime action | do not rely on it | Low | same |
| `G52` | Accepted no-op | No meaningful effect | none | none | no runtime action | do not rely on it | Low | same |
| `G53` | Yes, nonstandard | Yes | none | none | sets origin to `G54`/origin 0 and clears `G92` | not standard machine-coordinate semantics | High: avoid | `A2MCSource/NCParser.cs::ProcessGCode` |
| `G54` | Yes | Yes | none | none | selects origin 0 | gated by `EnableG54G28` | High | same |
| `G55`-`G59` | Yes | Yes | none | none | selects origins 1-5 | blocked by `OriginBlocker` in some job-start flows | High | same |
| `G80` | Yes | Yes | none | none | cancel canned cycle | sets interpolation to `-1` | Low | same |
| `G81` | Yes | Yes | `X Y Z` typical | `R F L` | drill cycle, no dwell, no peck | implemented by canned-cycle subsystem | Low | `A2MCSource/NCParser.cs::ProcessGCode`, `A2MCSource/CannedCycles.cs` |
| `G82` | Yes | Yes | `X Y Z` typical | `R F L P` | drill cycle with dwell | canned-cycle `P` is stored as seconds | Low | same |
| `G83` | Yes | Yes | `X Y Z` typical | `R F L P Q` | peck drill cycle | peck depth from `Q` | Low | same |
| `G84` | Partial | Yes | tool-specific | `R F L P Q` | tapping cycle | only clearly implemented for servo tapper path | Low | same |
| `G85`-`G89` | Parser recognizes, runtime unsupported | N/A | N/A | N/A | enter canned mode with invalid type, then fault as unsupported | do not generate | High: avoid | `A2MCSource/NCParser.cs::ProcessGCode`, `A2MC_CE/CannedCycles/def/CannedCycleData.cs`, `A2MCSource/CannedCycles.cs` |
| `G90` | Yes | Yes | none | none | absolute positioning | default on fresh parse | High | `A2MCSource/NCParser.cs::ProcessGCode` |
| `G91` | Yes | Yes | none | none | incremental positioning | `I/J/K` become illegal in this mode | High | same |
| `G92` | Partial, nonstandard | Yes | usually `X/Y` | `Z` parsed but ineffective offset | stores current X/Y as offset base and applies offsets to later X/Y parsing | Z offset is effectively disabled; behavior is not standard Fanuc-style | High: avoid | `A2MCSource/NCParser.cs::ProcessGCode`, `G92XOffset`, `G92YOffset`, `G92ZOffset` |
| `G92.2` | Yes | One-shot | none | none | clears `G92` | uses decimal `.2` detection | Medium | `A2MCSource/NCParser.cs::ProcessGCode` |
| `G94` | Accepted no-op | No meaningful effect | none | none | no runtime action | feed is already treated as per-minute | Low | same |
| `G98` | Yes | Yes | none | none | canned cycle returns to original Z | only meaningful during canned cycles | Low | `A2MCSource/NCParser.cs::ProcessGCode`, `A2MCSource/CannedCycles.cs` |
| `G99` | Yes | Yes | none | none | canned cycle returns to retract Z | only meaningful during canned cycles | Low | same |
| unknown `G` | Ignored by default | N/A | N/A | N/A | logs nonfatal unknown G | becomes fatal if `trapunknowncodes == true` | High: avoid | `A2MCSource/NCParser.cs::ProcessGCode`, `A2MCSource/Functions.cs` |

## 7. M-code support matrix
| Code | Supported | Modal | Required params | Optional params | Execution effect | Operator interaction | Post relevance | Code reference |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `M0` | Yes | No | none | none | pause job | allows jog-then-resume; interlock must clear before resume | Medium | `A2MCSource/MCodes.cs::DoThisM`, `A2MC_CE/MCodeImplementations.cs::mcodeM0M1Pause` |
| `M1` | Yes | No | none | none | same as `M0` | no optional-stop enable was found; behavior is same as `M0` | Medium | same |
| `M2` | Yes | No | none | none | sets `StopParsing = true` | cleanup happens later in `ProcessCurrentNCFile` / `EndNicely` | High | `A2MCSource/MCodes.cs::DoThisM` |
| `M3` | Yes | modal spindle/device state | active tool, usually `S` | none | turn device on forward | if spindle `S` missing, parser falls back to tool default spindle speed | High | `A2MCSource/MCodes.cs::ToolONOFF`, `A2MCSource/NCParser.cs::ProcessNCLine` |
| `M4` | Yes | modal spindle/device state | active tool, usually `S` | none | turn device on reverse | same verify limits as `M3` | High | same |
| `M5` | Yes | modal spindle/device state | active tool | none | turn device off | also clears spindle modal flag | High | same |
| `M6` | Yes | No | active `T` | none | tool change | verifies setup/qualify/lock state; runtime may raise Z first | High | `A2MCSource/MCodes.cs::RunMCode` |
| `M7` / `M8` | Yes | modal mister state | none | none | mister on | none | Medium | `A2MCSource/MCodes.cs::RunMCode` |
| `M9` | Yes | modal mister state | none | none | mister off | none | Medium | same |
| `M11` | Accepted no-op | No | none | none | returns true | none | Low | same |
| `M25` | Accepted no-op | No | none | none | returns true | none | Low | same |
| `M51`-`M55` | Yes | No | none | none | direct carriage-board modbus outputs | none | Low | `A2MCSource/MCodes.cs::RunMCode` |
| `M64` | Yes | No | none | none | cycles pusher | none | Low | same |
| `M70` | Yes | No | none | none | sheet marker for multi-sheet jobs | affects shape/sheet numbering and UI | Medium | `A2MCSource/MCodes.cs::MultiSheetJob` |
| `M98` | Yes | No | `P` = `O` number | `L` repeat count | jump to subroutine | none | Medium | `A2MCSource/MCodes.cs::JumpToSubroutine`, `A2MCSource/NCSearcher.cs::JumpToSubroutine` |
| `M99` | Yes | No | none | none | return from subroutine | repeats until `L` satisfied | Medium | `A2MCSource/MCodes.cs::ReturnFromSubroutine` |
| `M137R#` | Special-case partial support | No | `R` repeat count during verify | none | panel-builder job repeat attribute | affects `JobRepeat` in `StartTwo` | Low | `A2MCSource/NCParser.cs::ProcessNCLine`, `StartTwo` |
| `M160` / `M161` | Yes | No | none | none | Graco dispenser on/off | none | Low | `A2MCSource/MCodes.cs::RunMCode` |
| `M251` / `M252` | Yes | No | none | none | camera up/down | may re-home to camera position | Low | same |
| `M260` / `M261` | Yes | No | none | none | AVS locator flag off/on | none | Low | same |
| `M262` / `M263` / `M264` | Yes | No | command-specific payload in line | none | AVS transpose controls | none | Low | same |
| `M270` | Yes | No | printer payload on current line | none | send printer line | printer-specific backend | Medium | same |
| `M271` | Partial | No | none | none | trigger printer for AXYZ/mark/linx; no-op for labeler | none | Medium | same |
| `M272` | Yes, labeler-only | No | label payload in parentheses | none | send label data and print/place in one command | may prompt to clear stale label; verify checks tool/printer/place location | High | `A2MCSource/MCodes.cs::RunMCode`, `A2MC_CE/Labeler/Labeler.cs`, `A2MC_CE/Labeler/process/LabelerSendLabel.cs` |
| `M273` | Yes, labeler-only | No | `x;y;imageName` in parentheses | none | send image label and print/place in one command | same as `M272`; `.bmp` appended if omitted | High | same |
| `M280` | Yes | No | none | none | clear material / push off table | runtime only; can stop/abort on sensor/stop conditions | High if using automation | `A2MCSource/MCodes.cs::RunMCode`, `A2MC_CE/MaterialHandling/PushOffBar.cs::clearMaterial` |
| `M281` | Yes | No | none | none | drag-on load material without unload | runtime only; no verify checks | High if using automation | `A2MCSource/MCodes.cs::RunMCode`, `A2MC_CE/MaterialHandling/DragOnLoader.cs::LoadMaterial` |
| `M282` | Yes | No | none | none | drag-on load material with push-off unload | runtime only; may prompt if unload sensor is blocked | High if using automation | same |
| `M330` | Yes | No | none | none | legacy multicam label pickup sequence | hardware-specific | Low | `A2MCSource/MCodes.cs::RunMCode` |
| `M331` | Unsafe/ambiguous legacy | No | none | none | falls through into `M800` handling in current switch | treat as broken / do not emit | High: avoid | `A2MCSource/MCodes.cs::RunMCode` |
| `M800` | Yes | No | `D` drill code | none | fire pneumatic/electric/gang/boring-unit drills | may pause job if command fails | Low | `A2MCSource/MCodes.cs::RunMCode`, `A2MC_CE/MCodeImplementations.cs::mcodeM800...` |
| `M801` / `M802` | Yes | No | tool context | none | pen down/up | none | Low | `A2MCSource/MCodes.cs::RunMCode` |
| `M803` | Yes | No | tool context | none | manifold control | none | Low | same |
| `M804` / `M805` | Yes | No | tool context | none | boring-unit saw lower/raise | updates modal `D` for resume logic | Low | same |
| `M808` / `M809` | Yes | No | none | none | vacuum 1 on/off | `M809` respects AUTO config and may no-op | Medium | same |
| `M810` / `M811` | Yes | No | none | none | dust extractor on/off | none | Medium | same |
| `M814` / `M815` | Yes | No | none | none | vacuum 2 on/off | `M815` respects AUTO config and may no-op | Medium | same |
| `M820` / `M821` / `M822` / `M823` | Yes | No | none | none | dispenser/tamper/knife helpers | hardware-specific | Low | same |
| `M830` / `M831` | Yes | No | none | none | Z-touch / move-up-from-touch | probing/tooling-specific | Low | same |
| `M840` / `M841` | Yes | No | none | none | pre-movement safety check | prompts while waiting for “safe to move” input | Low | `A2MCSource/MCodes.cs::DoThisM`, `PreMovementSafetyCheck` |
| `M888` | Yes | No | none | none | record servo/tool position to log | none | Low | `A2MCSource/MCodes.cs::RunMCode` |
| `M90210`-`M90217` | Yes | No | none | none | internal debug logging toggles | none | Low | `A2MCSource/MCodes.cs::DoThisM` |
| unknown `M` | Ignored by default after Aussie/IO fallback | N/A | N/A | N/A | may be handled by `DoAussieMCodes` or `IOMCodes`; otherwise ignored | becomes fatal if `trapunknowncodes == true` | High: avoid | `A2MCSource/MCodes.cs::RunMCode` |

## 8. Address word matrix
| Word | Meaning | Where valid | Modal / non-modal | Default behavior | Validation notes | Code reference |
| --- | --- | --- | --- | --- | --- | --- |
| `A` | A-axis angle | motion lines | non-modal target, but updates modal A-axis state for line | absolute or incremental per `G90/G91` | cannot coexist with Y on same line; cannot be used with `G2/G3`; verify fails if A-axis disabled | `A2MCSource/NCParser.cs::ProcessNCLine` |
| `D` | modal drill / device code | drills, boring unit, some compensation contexts | modal | default `0` | used by gang drill / boring-unit routines; also stored for resume | same |
| `F` | feed rate | motion and canned cycles | modal | tool feed rate on init | ignored if `<= 0.25`; A-only moves map to radial feed path | same |
| `G` | preparatory code | all lines | modal or one-shot by code | persists by code rules | unknown G ignored unless `trapunknowncodes` | `A2MCSource/NCParser.cs::ProcessGCode` |
| `H` | parsed but ignored | anywhere | effectively ignored | no effect | do not rely on it | `A2MCSource/NCParser.cs::ProcessNCLine` |
| `I` / `J` / `K` | arc center coords | arc lines | non-modal per line | none | illegal in `G91`; `I/J` get G92 offsets added; `K` does not | same |
| `L` | repeat count | `M98`, canned cycles | modal scratch value | `-1` at line start | for subroutines, minimum repeat forced to `1` at `M98` | same, `A2MCSource/MCodes.cs::JumpToSubroutine` |
| `M` | miscellaneous code | all lines | mostly one-shot; some update modal spindle/mister state | none | multiple M codes on one line execute sequentially left-to-right | `A2MCSource/NCParser.cs::ProcessNCLine`, `A2MCSource/MCodes.cs::DoThisM` |
| `N` | sequence number | any line | modal scratch value | `0` on init | used for UI jump/search only; no execution effect | `A2MCSource/NCParser.cs::ProcessNCLine`, `A2MCSource/NCSearcher.cs::FindNCLineNumber` |
| `O` | subroutine label number | raw line labels / `M98` targets | non-modal | none | only meaningful when a trimmed line starts with `O`; not normal program-number handling | `A2MCSource/NCSearcher.cs::JumpToSubroutine`, `A2MCSource/NCParser.cs::ProcessNCLine` |
| `P` | overloaded parameter | `G4`, canned cycles, `M98` | non-modal scratch value | `-1` at line start | `G4` only works if `G4` was already parsed on the line; canned-cycle `P` is dwell seconds | `A2MCSource/NCParser.cs::ProcessNCLine`, `A2MCSource/CannedCycles.cs` |
| `Q` | peck depth | canned cycles | non-modal | none | only used by canned cycles | `A2MCSource/NCParser.cs::ProcessNCLine` |
| `R` | overloaded parameter | `G2/G3`, canned cycles, `M137` | non-modal | none | for arcs, order-sensitive and requires move already known; for `M137` verify-only repeat attribute | same |
| `S` | spindle speed | spindle/device lines | modal | prior spindle modal or tool default fallback for `M3/M4` without explicit `S` | verify can warn/prompt if RPM exceeds tool/position max | `A2MCSource/NCParser.cs::ProcessNCLine`, `A2MCSource/MCodes.cs::ValidateSpindleRpmLimitsForVerification` |
| `T` | tool number | tool change lines | modal active tool selection | inherited from current machine state until changed | `T` alone forces implicit `M6`; `T... M6` ordering is unsafe | `A2MCSource/NCParser.cs::ProcessNCLine` |
| `X` / `Y` / `Z` | target coordinates | motion / canned cycles | modal target coordinates | current modal coordinates persist if omitted | X/Y get G92 offsets; Z G92 offset is effectively disabled | same |
| `%` / `:` / `;` | comment / non-code markers | raw line text | non-modal | terminate parse for rest of line | `; CM2 G-CODE` sets `FMTFlag` | `A2MCSource/NCParser.cs::ProcessNCLine`, `SpecialOps` |

## 9. Code-by-code behavior
### 9.1 `G90` / `G91`
- `G90` sets absolute mode by clearing `Modals.ModalRelative`.
- `G91` sets relative mode by setting `Modals.ModalRelative`.
- In `G91`, `I/J/K` are explicitly rejected with `FileErrorIJKRelative`.
- Post implication: if Cut2Kit uses arcs, stay in `G90`.

Evidence:

- `A2MCSource/NCParser.cs::ProcessGCode`
- `A2MCSource/NCParser.cs::ProcessNCLine`

### 9.2 `G20` / `G21`
- `G20` sets inch mode.
- `G21` sets metric mode.
- Internal distances are still converted to inches by `GetNCDouble`.
- Post implication: emit `G20` or `G21` explicitly at file start; do not rely on machine defaults.

### 9.3 `G55`-`G59`
- `G55`-`G59` map to machine origins `1`-`5`.
- They clear `G92`.
- They call `InitializeMotion()` at runtime and recalculate boundaries.
- `OriginBlocker` can temporarily suppress them during a special start flow.

Evidence:

- `A2MCSource/NCParser.cs::ProcessGCode`

### 9.4 `G53` and `G54`
- `G54` selects origin `0`.
- `G53` also selects origin `0`.
- This is not standard machine-coordinate `G53`.
- Post implication: do not emit `G53`; use `G54` if origin 0 is intended.

### 9.5 `G0`
- `G0` is the delimiter that ends the current buffered shape.
- Before the actual rapid move, runtime flushes the buffered shape via `ProcessFrag(...)` or `RunShape()`.
- The move then runs through `DoG0Move()`, which includes:
  - Z-safety logic
  - restricted-zone reroute logic
  - saw-specific handling
  - copy-tool carriage handling
- Post implication: `G0` is not just a modal change; it is the execution boundary for contour buffering.

Evidence:

- `A2MCSource/NCParser.cs::DoRealMotion`
- `A2MCSource/NCParser.cs::DoG0Move`

### 9.6 `G1`
- `G1` enters feed mode and contributes fragments to the current shape.
- Feed comes from `min(Modals.ModalF, UserFeedSpeed, tool feed, machine feed)`.
- Very short moves can be dropped by significance checks.
- Post implication: do not emit zero-length or near-zero moves.

### 9.7 `G2` / `G3`
- Center-format arcs use `I/J/K`.
- Radius-format arcs use `R` and are converted into centers by `ConvertRToIJK(...)`.
- XY arcs over 180 degrees are rejected by `ArcLength(...)` / `SplitCircle(...)` with `FileErrorArcTooLarge`.
- `A`-axis motion on an arc line is rejected.
- Post implication:
  - safest output is center-format XY arcs
  - never emit arcs over 180 degrees
  - if using `R`, place `G2/G3` and the endpoint words before `R`

Evidence:

- `A2MCSource/NCParser.cs::ConvertRToIJK`
- `A2MCSource/NCParser.cs::SplitCircle`
- `A2MCSource/NCParser.cs::ArcLength`

### 9.8 `G4`
- `G4` sets a dwell flag.
- `P` on the same line after `G4` is copied into `Modals.xyz.pause`.
- Runtime flushes the current fragment, then sleeps for `pause * 1000` ms.
- The dwell counter display says `sec`, and the implementation uses seconds.
- Post implication:
  - emit dwell as `G4 P<seconds>`
  - keep `G4` before `P` on the same line

Evidence:

- `A2MCSource/NCParser.cs::ProcessGCode`
- `A2MCSource/NCParser.cs::ProcessNCLine`
- `A2MCSource/NCParser.cs::MoveMachine`

### 9.9 `M0`
- Runtime only; verify passes through it.
- Turns devices off, raises tools to top, pauses the job, allows jogging, then resumes only after interlock clears.
- No separate optional-stop enable was found.

Evidence:

- `A2MC_CE/MCodeImplementations.cs::mcodeM0M1Pause`

### 9.10 `M3` / `M4` / `M5`
- `M3` and `M4` command device-on states depending on tool type.
- For spindle-class tools, they update modal `S`, modal spindle flag, direction, and runtime spindle command.
- During verify, `ValidateSpindleRpmLimitsForVerification(...)` can prompt if requested RPM exceeds tool or position limits.
- If `M3/M4` occurs without a valid `S` on the line, runtime may fall back to the tool’s configured spindle speed.
- `M5` clears spindle modal state and turns the device off.

Evidence:

- `A2MCSource/MCodes.cs::ToolONOFF`
- `A2MCSource/MCodes.cs::ValidateSpindleRpmLimitsForVerification`
- `A2MCSource/NCParser.cs::ProcessNCLine`

### 9.11 `M6`
- Tool change checks:
  - tool setup complete
  - special printer/vision tool interception
  - qualification checks
  - lock checks during verify
- Runtime may first move Z to table top if not already in `G0`.
- Then it calls `a2mc.tc.CheckAndProcessToolChange(TNumber, true)`.

Critical ordering rule:

- `Tn` alone is enough to trigger an implicit `M6`.
- `M6 Tn` on one line executes once and is safe.
- `Tn M6` on one line is unsafe because the parser executes the implicit `M6` when it reaches the explicit `M`, then queues another `M6` for end-of-line execution.

Post implication: use `M6 Tn`, not `Tn M6`.

Evidence:

- `A2MCSource/NCParser.cs::ProcessNCLine`
- `A2MCSource/MCodes.cs::RunMCode`

### 9.12 `M30`
- `M30` only sets `StopParsing = true` at the M-code layer.
- Actual cleanup happens after the parse loop exits:
  - flush pending shape
  - turn plasma off
  - move tools to safe height
  - optional `FMTFlag` move to `X0 Y0`
  - `EndNicely(...)`
- Post implication: put `M30` on its own line near file end and expect cleanup after loop exit, not inside the M-code itself.

Evidence:

- `A2MCSource/MCodes.cs::DoThisM`
- `A2MCSource/NCParser.cs::ProcessCurrentNCFile`

### 9.13 `M272` / `M273`
- These are labeler-only commands.
- Both are one-shot “send and print/place” commands. They do not queue a later separate label action.
- Verify mode:
  - checks active tool is a label applicator
  - initializes/keeps labeler connection
  - parses payload
  - checks place location
  - performs first-job printer verification once
- Runtime:
  - may prompt to clear a leftover label
  - sends label data in a background thread
  - immediately runs the print/place sequence
  - on stop during label handling, sets `PauseFlag = true`, `PauseType = OperatorPause`, and decrements `FileLineCount` so the label line re-runs on resume

`M272` payload format:

- payload lives inside parentheses after the M-code
- exactly 12 semicolon-separated fields:
  `x;y;template;panelName;panelNumber;barcode;header1;data1;header2;data2;header3;data3`

`M273` payload format:

- payload inside parentheses
- exactly 3 semicolon-separated fields:
  `x;y;imageName`
- `.bmp` is appended if omitted

Post implications:

- ensure a label-applicator tool is active before `M272/M273`
- keep the payload inside parentheses exactly in the expected field count
- do not assume `M271` is needed for labeler mode; it is a no-op there

Evidence:

- `A2MCSource/MCodes.cs::RunMCode`
- `A2MC_CE/Labeler/Labeler.cs::printAndPlaceValidate`, `printAndPlaceLabel`, `setOperaturePauseState`
- `A2MC_CE/Labeler/process/LabelerSendLabel.cs`

### 9.14 `M280` / `M281` / `M282`
- `M280` runs push-off / clear-material.
- `M281` runs drag-on load without unloading first.
- `M282` runs drag-on load with push-off unload.
- All three return `true` immediately in verify mode. No simulation or preflight validation happens there.
- Runtime behavior is hardware-sequenced and blocking:
  - raise tools safe
  - manipulate vacuum/pins/rollers
  - move gantry through loader/push-off positions
  - abort on stop, sensor faults, or routine failure
- `M282` may prompt if the unload sensor is already active.

Post implication: only emit these commands in deliberate material-handling programs. They are machine actions, not NC geometry commands.

Evidence:

- `A2MCSource/MCodes.cs::RunMCode`
- `A2MC_CE/MaterialHandling/PushOffBar.cs::clearMaterial`
- `A2MC_CE/MaterialHandling/DragOnLoader.cs::LoadMaterial`

### 9.15 `T`, `F`, `P`, `S`, `X`, `Y`, `Z`, `I`, `J`, `K`, `R`, `H`, `D`, `Q`, `L`, `N`, `O`
- `T`: implicit tool-change trigger
- `F`: modal feed; values `<= 0.25` are ignored
- `P`: dwell seconds for `G4`; `O` number for `M98`; canned-cycle dwell
- `S`: modal spindle speed
- `X/Y/Z`: current target coordinates; omitted axes remain modal
- `I/J/K`: arc centers; illegal in `G91`
- `R`: arc radius or canned-cycle retract; also special `M137R#` repeat attribute during verify
- `H`: ignored
- `D`: modal drill/device code
- `Q`: canned-cycle peck only
- `L`: subroutine repeat count and canned-cycle repeat
- `N`: sequence number for UI jump/search only
- `O`: subroutine label only when the raw trimmed line begins with `O`

## 10. Operator interaction and runtime controls
### 10.1 Pause behavior
Pause states include:

- operator stop
- interlock trips
- `M0` / `M1`
- labeler pause-on-failure
- some device-specific command failures

When a recoverable pause is prepared, `OperatorPausePrep(...)`:

- stores pause position
- marks `PauseFlag = true`
- raises tools or turns devices off as appropriate
- preserves enough state for resume

Evidence:

- `A2MCSource/NCParser.cs::OperatorPausePrep`
- `A2MC_CE/MCodeImplementations.cs::mcodeM0M1Pause`
- `A2MC_CE/Labeler/Labeler.cs::setOperaturePauseState`

### 10.2 Resume behavior
Resume is not a simple continue. A2MC may:

- restore tool/device state through `PrepareToStart`
- move back to saved XY/Z pause position
- rerun spindle/plasma restart logic
- re-enter the parse loop at the saved line number

### 10.3 Stop behavior
`Stop` during queued state cancels before execution.

`Stop` during runtime usually:

- sets an operator/system pause or error path
- may prompt `Stop and Lift?`
- turns devices off or moves tools safe
- records job history

### 10.4 Optional stop
No separate optional-stop enable/disable logic was found. `M1` is handled the same way as `M0`.

### 10.5 Tool-change interaction
Tool change behavior is delegated to `ToolChange.CheckAndProcessToolChange(...)` and qualification helpers. The parser/runtime enforces:

- tool setup complete
- tool not locked during verify
- tool qualification checks

### 10.6 Label-print interaction
Labeler runtime can pause and rerun the same NC line on resume. This is more like a recoverable operator pause than a conventional printer alarm.

### 10.7 Restart / jump behavior
A2MC supports:

- jump-to-shape
- jump-to-`N`
- subroutine return/jump
- resume from paused line

Evidence:

- `A2MCSource/NCParser.cs::jumpShapeRoutine`
- `A2MCSource/NCSearcher.cs::FindNCLineNumber`
- `A2MCSource/NCSearcher.cs::JumpToSubroutine`

## 11. End-of-program behavior
### 11.1 What `M30` itself does
`M30` only requests end-of-program by setting `StopParsing = true`.

### 11.2 What happens after the loop exits normally
At normal runtime completion, `ProcessCurrentNCFile(false, ...)` does this:

1. `ProcessFrag(false, false)` to flush leftover fragments
2. `a2mc.km.RunShape()`
3. `a2mc.cf.TurnPlasmaOff()`
4. `a2mc.tc.AllToolsToSafeHeight(KillSpindles, true)`
5. if `FMTFlag`, move to `X0 Y0`
6. if tooltip compensation file exists, append `M30`
7. `EndNicely(StartTicks)`
8. record normal job history

Evidence:

- `A2MCSource/NCParser.cs::ProcessCurrentNCFile`

### 11.3 `EndNicely`
`EndNicelyProcedure()` then:

- stops roller hold-down running state
- turns AUTO equipment off at final-job completion
- turns off mister, markers, engraver jet
- retracts panel-printer head if needed
- logs completion and total runtime
- resets fast motion parameters
- optionally parks the machine
- resets vision/A-axis/job-complete state
- resets barcode-ready state

Evidence:

- `A2MCSource/NCParser.cs::EndNicelyProcedure`

### 11.4 Modal reset/persistence after job end
- parser modals are reinitialized on the next parse
- modal spindle/tool state objects still exist in memory, but runtime cleanup turns real devices off
- labeler job state is reset when `StartPushed` finally exits with `PauseFlag == false`

## 12. Cut2Kit post requirements
Recommended rules for a first-pass compatible post:

1. Emit uppercase only.
2. Emit an explicit modal startup block. Do not rely on machine defaults.
3. Emit an explicit work offset (`G54` or `G55`-`G59`) near the start.
4. Use `G90`.
5. Prefer `G20` unless there is a firm requirement for metric output. If using `G21`, remember A2MC converts internally to inches.
6. Avoid `G53`. It is nonstandard here.
7. Avoid `G92`.
8. Use `M6 Tn` for tool changes. Do not emit `Tn M6`.
9. Use one M code per line unless there is a specific proven reason not to.
10. Prefer center-format arcs (`I/J`) over `R` arcs.
11. If `R` arcs are used, put `G2/G3` and endpoint words before `R`.
12. Never emit arcs over 180 degrees. Split them.
13. Do not emit `I/J/K` in `G91`.
14. Use `G4 P<seconds>` with `G4` before `P`.
15. If using labeler output:
    - change to a label applicator tool first
    - emit full `M272(...)` or `M273(...)` payload on one line
    - do not rely on `M271` in labeler mode
16. If using automation:
    - `M280`, `M281`, and `M282` are real machine actions
    - they are not validate/simulate commands
17. End with standalone `M30`.

## 13. Recommended starter post template
### 13.1 Starter template
```nc
(Cut2Kit -> A2MC starter)
G90 G20
G54
M6 T1
S18000 M3
G0 X1.000 Y1.000
G0 Z0.500
G1 Z-0.250 F150.0
G1 X5.000 Y1.000 F250.0
G1 X5.000 Y3.000
G1 X1.000 Y3.000
G1 X1.000 Y1.000
M5
G0 Z0.500
G0 X0.000 Y0.000
M30
```

Why this is safe:

- explicit `G90`/`G20`
- explicit `G54`
- safe `M6 T1` ordering
- explicit spindle command
- no `G92`, no `G53`, no >180 degree arcs
- `M30` on its own line

### 13.2 Likely safe A2MC startup block
```nc
G90 G20
G54
M6 T1
S18000 M3
```

Expected A2MC behavior:

- absolute inch mode
- origin 0 selected
- tool 1 loaded
- spindle modal speed set to 18000 and spindle commanded on

### 13.3 Simple contour program
```nc
G90 G20
G54
M6 T1
S18000 M3
G0 X2.000 Y2.000
G0 Z0.250
G1 Z-0.125 F120.0
G1 X6.000 Y2.000 F240.0
G1 X6.000 Y4.000
G1 X2.000 Y4.000
G1 X2.000 Y2.000
M5
G0 Z0.250
M30
```

Expected A2MC behavior:

- verify pass computes bounds and tool/spindle checks
- first `Start` queues the job
- second `Start` executes the contour as one or more buffered shapes

### 13.4 Tool change example
```nc
M6 T2
S12000 M3
```

Expected A2MC behavior:

- one tool change only
- modal spindle speed becomes `12000`
- `M3` turns the tool/device on

Do not emit:

```nc
T2 M6
```

That ordering can execute the tool change twice in the current parser.

### 13.5 Dwell example
```nc
G4 P0.5
```

Expected A2MC behavior:

- flush buffered fragment if needed
- dwell for approximately 0.5 seconds

### 13.6 Label-printing examples
Templated label:

```nc
M6 T50
M272(12.700;25.400;BASIC;PANEL_A;1;BC123;LOT;42;JOB;CUT2KIT;REV;A)
```

Expected A2MC behavior:

- tool 50 must resolve to a label applicator
- verify checks printer/tool/place location
- runtime sends the label and immediately prints/places it

Image label:

```nc
M6 T50
M273(12.700;25.400;panel_a_label)
```

Expected A2MC behavior:

- image file `panel_a_label.bmp` is loaded from the label image folder if extension omitted
- runtime sends and prints/places immediately

### 13.7 Material-handling examples
Load new material without unloading first:

```nc
M281
```

Load new material and unload the previous sheet first:

```nc
M282
```

Push finished material off the table:

```nc
M280
```

Expected A2MC behavior:

- these run machine-side loader/push-off routines immediately
- they are runtime machine actions, not simulated NC geometry

### 13.8 Safe end-of-program block
```nc
M5
G0 Z0.500
G0 X0.000 Y0.000
M30
```

Expected A2MC behavior:

- spindle/device off
- rapid to safe Z and origin
- `M30` ends parsing
- A2MC then performs final cleanup via `EndNicely`

## 14. Risks, ambiguities, and implementation cautions
1. `Tn M6` ordering is unsafe in the current parser. Use `M6 Tn`.
2. `G53` is nonstandard. It behaves like “select G54”.
3. `G92` is nonstandard and incomplete. `G92ZOffset()` is effectively disabled.
4. `G85`-`G89` are parser-recognized but not actually implemented as executable canned cycles.
5. `G18`/`G19` are accepted, but XY-plane arc behavior is much more completely implemented than other planes. Avoid non-XY arcs unless separately qualified.
6. `R` arcs are order-sensitive because `ConvertRToIJK(...)` runs during token scan, not after full block normalization.
7. `G4` is order-sensitive. `P` must appear after `G4` on the line.
8. Unknown `G`/`M`/word behavior depends on `trapunknowncodes`. Default is ignore/log, but the operator can enable faulting.
9. First-start behavior is two-stage for normal operator use: verify/queue, then execute on second `Start`.
10. Move HMI control can skip normal verification.
11. Labeler behavior is tightly coupled to active printer type and active tool type. `M272/M273` are not generic printer commands.
12. `M280/M281/M282` are not verify-backed. They execute real material handling only at runtime.
13. `M331` currently falls through to unrelated drill-fire handling and should be treated as broken for post generation.
14. Subroutine labels rely on raw trimmed lines beginning with `O`. Treat them as a legacy feature, not modern program-number semantics.
15. Subroutine nesting depth is capped by `MaxSubDepth = 20`.

## 15. Code reference index
- `A2MCSource/Program.cs::Main`  
  WinForms entrypoint.
- `A2MCSource/A2MotionController.cs::A2MotionControllerGUI`  
  Constructs `A2MC`.
- `A2MCSource/A2MC.cs::A2MC`  
  Wires parser, M-codes, motion, thread host, sockets.
- `A2MCSource/HostMain.cs::RunHostThread`  
  Main operator loop and key dispatch.
- `A2MCSource/HostMain.cs::runJobDirectly`  
  Normal `Start` path into `NCParser.StartPushed`.
- `A2MCSource/NCParser.cs::StartPushed`  
  Outer start wrapper and final cleanup/reset.
- `A2MCSource/NCParser.cs::ProcessStartPushedProcedure`  
  Fresh start, verify, queued-state, resume, second-start handoff.
- `A2MCSource/NCParser.cs::StartTwo`  
  True execution start for runtime cutting.
- `A2MCSource/NCParser.cs::ProcessCurrentNCFile`  
  Main file-open, line loop, verify/runtime split, normal completion path.
- `A2MCSource/NCParser.cs::ProcessNCLine`  
  Token scanner and per-line interpreter.
- `A2MCSource/NCParser.cs::ProcessGCode`  
  G-code modal/state dispatch.
- `A2MCSource/NCParser.cs::MoveMachine`, `DoRealMotion`, `DoG0Move`, `ProcessFrag`  
  Motion translation and execution handoff.
- `A2MCSource/NCParser.cs::ConvertRToIJK`, `SplitCircle`, `ArcLength`  
  Arc handling and >180 degree rejection.
- `A2MCSource/NCParser.cs::InitializeModals`, `TranslateXYZ`  
  Modal initialization and coordinate translation.
- `A2MCSource/NCSearcher.cs::PrepareToStart`  
  Resume/start-state reconstruction.
- `A2MCSource/NCSearcher.cs::FindNCLineNumber`, `JumpToSubroutine`  
  `N`-jump and `O`/`M98` subroutine support.
- `A2MCSource/MCodes.cs::DoThisM`, `RunMCode`  
  M-code dispatch.
- `A2MCSource/MCodes.cs::ToolONOFF`, `ValidateSpindleRpmLimitsForVerification`  
  spindle/device semantics and verify-time RPM warning.
- `A2MC_CE/MCodeImplementations.cs::mcodeM0M1Pause`  
  pause/resume behavior for `M0` / `M1`.
- `A2MC_CE/Labeler/Labeler.cs`  
  labeler verify/runtime logic and pause-on-failure behavior.
- `A2MC_CE/Labeler/process/LabelerSendLabel.cs`  
  `M272` / `M273` payload parsing.
- `A2MC_CE/MaterialHandling/PushOffBar.cs::clearMaterial`  
  `M280`.
- `A2MC_CE/MaterialHandling/DragOnLoader.cs::LoadMaterial`  
  `M281` / `M282`.
- `MotionLib/MotionLib/NewMotionCard.cs::MotionControl.StartMotion`  
  buffered shape handoff to motion hardware.
