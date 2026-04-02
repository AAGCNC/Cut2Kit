# Cut2Kit Scope Specification (Draft v0.1)

## 1. Document Status

- **Product:** AXYZ Cut2Kit
- **Status:** Draft scope and platform recommendation
- **Primary audience:** Product, software, CAM, applications, electrical/mechanical stakeholders, and implementation agents
- **Authoring basis:** User requirements, whiteboard notes, target-customer context, adjacent AAG machine notes, and public T3 Code / Codex architecture research
- **Primary goal of this document:** Define the initial product scope, platform choice, architecture direction, build plan, and first implementation slice for an AI-first Cut-to-Kit CAM application

---
## 1A. Evidence, Constraints, and Inputs

### Direct inputs used for this spec
- User requirements from chat
- Whiteboard image labeled **Cut to Kit**
- Adjacent AXYZ engineering brief for IMP/SIP vertical processing
- Triple M Housing public site and process descriptions
- Public T3 Code repository structure and Codex integration patterns
- OpenAI Codex public documentation/blog material for App Server and login/auth behavior

### Important constraint
This scope is **not** based on a direct inspection of `/mnt/c/src/Cut2Kit` from this environment, because that path was not mounted here at authoring time. The platform recommendation and Codex execution prompt are therefore grounded in:
1. the stated intent that Cut2Kit is a T3 Code fork or close derivative,
2. public T3 Code architecture,
3. the Cut2Kit-specific product requirements supplied by the user.

### Practical implication
The scope document is decision-oriented enough to start implementation, but the accompanying Codex prompt explicitly instructs the agent to first inspect the actual repo and adapt the work to what is truly present.

---


## 2. Executive Summary

Cut2Kit should be a **desktop-first, local-first AI CAM workbench** for prefab housing production, initially optimized for **kitting workflows** and secondarily able to **queue line-side NC jobs**.

The operator workflow starts with opening a job directory. The application scans the folder, identifies DXF elevations and companion configuration files, normalizes job inputs, resolves customer-specific framing and panelization rules, produces panelization candidates, performs nesting, and generates queued NC output for downstream router execution. The application must support **flooring, siding, and roofing** use cases and must remain flexible because customer framing processes differ.

The recommended implementation path is to **use the T3 Code architecture as the base product platform**, not merely as inspiration:

- **Electron desktop shell** for Windows machine-side deployment
- **Local Node.js server** for orchestration, file access, AI process management, and queue generation
- **React/Vite web UI** for the operator experience
- **Shared contracts/domain packages** to keep data models consistent across server and UI
- **Codex App Server integration** to reuse existing `codex login` authentication and approval/event handling for interactive agent workflows

This should not become “AI decides everything.” The durable core of the product must remain **deterministic**:

- DXF ingestion
- unit normalization
- framing-rule execution
- panel break computation
- nest validation
- NC queue serialization
- post-processing

AI should sit on top of that deterministic engine to:

- infer or propose missing mappings
- translate customer process language into explicit rules
- suggest panelization strategies
- propose queue sequencing
- explain warnings and conflicts
- assist with troubleshooting and iteration

The first delivery should not attempt perfect nesting or production-grade G-code. The first delivery should prove the architecture and operator flow:

1. open a project directory  
2. discover and validate files  
3. load a project settings JSON  
4. classify DXFs and related inputs  
5. represent panelization/framing intent in explicit domain models  
6. generate placeholder panel, nest, and queue manifests  
7. create NC placeholders ready to be replaced later with real post logic  
8. expose an in-app “Cut to Kit Agent” using Codex to assist the operator and engineer

---

## 3. Business Context

### 3.1 Problem Being Solved

Prefab housing customers need a practical way to transform building-elevation and structural intent into production-ready router output for high-throughput manufacturing. In the target operating model, companies may aim to build multiple houses per day. That requires the software to shift from “single file CAM” to **job-centric orchestration**.

The current AXYZ capability already addresses **line-side** workflows using existing machine concepts such as LoadLine Edge with an offload table. Cut2Kit is intended to address the adjacent but distinct **kitting** workflow, while still allowing line-side queue output when needed.

### 3.2 Target Customer Pattern

A key target is a prefab manufacturer such as Triple M Housing. Their operating context suggests factory-controlled workflows, repeatability, automation, and high material throughput. Cut2Kit should therefore be built around:

- repeatable project templates
- customer-specific framing logic
- directory-based job intake
- auditable queue generation
- minimal operator friction

### 3.3 Product Position

Cut2Kit is not merely “CAM with a chatbot.” It is:

- a **project intake and normalization system**
- a **rule-driven panelization engine**
- a **nesting and queueing orchestration layer**
- a **CAM output stage**
- an **AI-assisted engineering operator console**

---

## 4. Goals

### 4.1 Primary Goals

1. **Directory-first project workflow**
   - Operators open a project directory and work from all available source files in one place.

2. **Flexible customer rule modeling**
   - Framing and panel-break rules vary by customer, process, material, and finishing requirements.
   - Initial rule definition should be expressed via JSON in the project directory.

3. **DXF-centered intake**
   - DXF elevations are the primary dimensional source for initial development.
   - Additional file types can be supported later.

4. **Panelization for prefab production**
   - The system must support flooring, siding, and roofing workflows.
   - Panelization must account for openings, framing members, seam preferences, and process constraints.

5. **Kitting-first output**
   - Primary output is a queue of NC jobs and manifests optimized for kit production.
   - Secondary output is line-side queueing.

6. **AI-first operator assistance**
   - The software should use Codex-based agent assistance to accelerate rule interpretation, diagnostics, and engineering iteration.

7. **Production-ready architecture**
   - The first implementation should be built on a platform that can grow into a real shipping product.

### 4.2 Non-Goals for the First Delivery

1. Perfect automatic structural inference from incomplete drawings
2. Full production-grade post processors for every machine/controller
3. ERP/MES integration
4. Multi-site cloud scheduling
5. Auto-generation of all customer rules from natural language with no review
6. Full optimization of cut strategy, tabs, feeds, and speeds
7. Fully autonomous unattended CAM approval

---

## 5. Product Principles

1. **Deterministic core, AI-assisted edge**
   - Geometry, validation, and output serialization must be reproducible.
   - AI suggestions must remain inspectable and overridable.

2. **Local-first execution**
   - Project files, large DXFs, and NC outputs should be handled locally near the machine environment.

3. **Operator transparency**
   - The system must show why a panel break, nest, or queue decision was made.

4. **Project-folder truth**
   - The job directory is the portable unit of work.
   - A project can be copied, archived, reviewed, or reprocessed from disk.

5. **Customer-specific rule packs**
   - Different prefab customers may need different framing and seam logic.
   - The product should support customer profiles and overrides.

6. **Progressive automation**
   - Start with guided automation and explicit approvals.
   - Increase autonomy only after trust is earned.

---

## 6. Core User Workflows

### 6.1 Kitting Workflow

1. Operator opens a project directory.
2. App scans for known files:
   - `*.dxf`
   - `cut2kit.settings.json`
   - optional structural/reference files
   - optional notes and output folders
3. App validates file presence and flags unknown or missing items.
4. App maps DXFs to house sides, assemblies, or material categories.
5. App loads customer process rules from JSON.
6. Deterministic engine resolves openings, stud/joist spacing logic, seam constraints, and candidate panel boundaries.
7. Operator reviews preview overlays.
8. Nesting engine produces stock-sheet layouts.
9. CAM stage generates queued NC placeholders or real NC output.
10. Queue is organized into kit sequence and manifests.

### 6.2 Line-Side Workflow

1. Same project intake as above
2. Select production mode = `lineSide`
3. Output queue is ordered for immediate line-side consumption rather than kit grouping
4. Same project may support both modes

### 6.3 AI-Assisted Engineering Workflow

1. Operator opens “Cut to Kit Agent”
2. Agent receives project context:
   - directory contents
   - settings JSON
   - detected DXFs
   - geometry warnings
   - unresolved mappings
3. Agent can:
   - explain validation issues
   - propose layer mappings
   - propose framing rules
   - propose panel break strategies
   - suggest queue sequencing
4. Operator approves or rejects proposed changes
5. Approved changes become explicit project data, not hidden conversational state

---

## 7. Source Inputs

### 7.1 Initial Required Inputs

- DXF files representing elevations and/or other dimensional source drawings
- Project settings JSON in the opened directory

### 7.2 Optional Inputs

- Structural CSVs or JSONs for studs, joists, openings, materials
- Customer profile files
- Machine profile files
- Notes / assumptions documents
- Output manifests from prior runs

### 7.3 Expected Directory Pattern

```text
<ProjectRoot>/
  cut2kit.settings.json
  README.md
  elevations/
    front.dxf
    rear.dxf
    left.dxf
    right.dxf
  floor/
    level1_floor.dxf
  roof/
    roof_a.dxf
  references/
    studs.csv
    joists.csv
    openings.csv
    materials.json
  output/
    manifests/
    nests/
    nc/
    reports/
  logs/
```

The exact file layout should be configurable, but the first implementation should support a sensible default pattern and recursive discovery.

---

## 8. Functional Requirements

## 8.1 Project Intake and File Explorer

The UI must include a left-side project explorer pane.

### Required capabilities

- Open a local directory
- Recursively list files and folders
- Detect supported input file types
- Detect known project configuration files
- Show per-file status:
  - recognized
  - unrecognized
  - warning
  - error
- Allow filtering by type:
  - DXF
  - JSON
  - CSV
  - output
  - other

### First-release acceptance

- User can open a directory and see a populated explorer
- App can discover all DXFs and the settings JSON
- App can report validation issues in-line

---

## 8.2 DXF Ingestion

DXF is the key initial dimensional input.

### Required capabilities

- Read DXF files from the project directory
- Capture metadata:
  - file name
  - modified time
  - size
  - units if available
  - layers if available
  - blocks/entities summary if available
- Allow the operator to classify the DXF:
  - elevation
  - floor
  - roof
  - siding
  - unknown
- Allow side/assembly assignment:
  - north/south/east/west
  - front/rear/left/right
  - customer-defined naming

### Important note

The first implementation may stop at metadata/layer extraction if full geometry normalization would slow delivery. The product architecture must still be designed so that real geometry parsing and panelization can be added cleanly.

---

## 8.3 Customer Rules and Settings

Customer-specific framing and panel-break process must be explicit and configurable. The initial vehicle is a JSON file stored in the project directory.

### Required rule categories

- Project metadata
- Customer identity/profile
- Production mode
- Material/assembly type
- Layer mapping
- Framing rules
- Opening behavior
- Panel break preferences
- Nesting preferences
- Queueing preferences
- Machine profile selection
- AI behavior and approval requirements

### Example framing variables

- stud spacing, e.g. `16 in OC`
- start reference, e.g. east wall
- stop/continue logic at openings
- double-stud policy at windows and doors
- whether a panel break can occur mid-way through a framing break
- drywall alignment preference
- joist direction and on-center spacing
- trim allowances, gaps, and kerf assumptions

### First-release behavior

- Load JSON
- Validate JSON against schema
- Surface schema errors in the UI
- Provide a sample file template
- Support defaults and explicit overrides

---

## 8.4 Structural Interpretation Layer

The product needs a domain layer that can represent “what the building wants” independently of specific machine output.

### Required domain concepts

- wall / floor / roof segment
- structural member
- opening
- seam candidate
- panel candidate
- stock sheet / raw material
- kit group
- queue item
- machine job

### Design requirement

Even if full structural automation is not available in phase 1, the data model must exist so later releases can consume:
- DXF-derived features
- imported structural data
- AI-proposed but operator-approved rules

---

## 8.5 Panelization Engine

This is the core product differentiator.

### Responsibilities

- Compute candidate panel boundaries
- Respect customer seam preferences
- Avoid invalid breaks through openings unless policy allows
- Align to framing/joist logic where required
- Support multiple material/application modes:
  - flooring
  - siding
  - roofing
- Produce explainable reasons for each break decision

### Output

Each panelization result should produce a structured output record:
- panel ID
- source elevation/assembly
- geometry reference
- width/height
- orientation
- required framing context
- seam rationale
- downstream nest priority
- destination mode (`kitting` or `lineSide`)

### First implementation target

Phase 1 does **not** need full production math, but it should create the engine boundary and the data contracts so logic can evolve safely.

---

## 8.6 Nesting Engine

The nesting system should eventually optimize stock usage and queue order. In the first delivery it can be partially placeholder, but the architecture must be real.

### Responsibilities

- Group panels by material/tooling/stock
- Compute nest candidates
- Output sheet assignments
- Preserve operator review and auditability
- Feed downstream NC generation

### AI role in nesting

AI may be used to propose strategy classes:
- group by house
- group by elevation
- group by kit sequence
- maximize yield
- minimize changeovers

But final nest validity must remain deterministic.

---

## 8.7 CAM and NC Queue Generation

The system must generate output artifacts that can later become real machine-ready jobs.

### Required output types

- `panel-manifest.json`
- `nest-manifest.json`
- `queue-manifest.json`
- `*.nc` placeholder files
- operator-readable summary report

### First-release NC behavior

- Produce deterministic placeholder NC files with stable identifiers
- Include metadata headers
- Do not hard-code final machine-specific G-code until post details are defined
- Establish the output contract now so post-processors can be dropped in later

### Queue requirements

- Queue for kitting
- Queue for line-side
- Allow mixed-mode projects
- Preserve sequence and grouping rationale

---

## 8.8 UI Requirements

### Required panes/views

1. **Left navigation**
   - project tree
   - file type indicators
   - validation badges

2. **Center workspace**
   - file summary
   - DXF metadata or preview
   - settings overview
   - panelization/nesting summaries

3. **Right utility/agent pane**
   - Cut to Kit Agent
   - validation output
   - queue summary
   - action history

### Required commands

- Open project directory
- Reload project
- Validate project
- Generate manifests
- Generate queue
- Launch AI assistance
- Approve/reject suggested rule edits

---

## 8.9 AI Agent Requirements

The product should expose an in-app agent tentatively called **Cut to Kit Agent**.

### Agent jobs

- Explain what is missing from the project
- Suggest layer mappings
- Suggest assembly classification
- Suggest or refine customer rule JSON
- Summarize conflicts between DXF geometry and framing rules
- Suggest panelization strategy variants
- Suggest queue sequencing by kit or line-side priorities
- Generate engineering notes

### Constraints

- Agent output must not silently mutate production data
- Every AI-generated change proposal must be reviewable
- Accepted changes become explicit project files or records

### Context supplied to the agent

- file inventory
- project settings
- machine profile
- validation report
- known customer profile
- user action history
- generated panel/nest/queue manifests

---

## 8A. Observed T3 Baseline (Public Reference)

This section captures the public T3 Code baseline that Cut2Kit should reuse unless the local fork has already diverged materially.

### Monorepo shape
The public T3 Code layout is a Bun/Turbo monorepo with top-level `apps/*`, `packages/*`, and `scripts/` workspaces. Its root scripts include `dev`, `dev:server`, `dev:web`, `dev:desktop`, `build`, and `build:desktop`.

### Application split
- `apps/desktop` = Electron shell
- `apps/web` = React/Vite frontend
- `apps/server` = local orchestration / CLI / provider runtime

### Provider integration pattern
The important Cut2Kit-relevant pattern is:
1. desktop app starts locally,
2. desktop app launches a local backend/server child process,
3. backend manages provider sessions,
4. Codex is launched as a local `codex app-server` child process,
5. UI receives streamed provider events and approval requests.

### Why this matters for Cut2Kit
That baseline is already a strong fit for:
- local project-folder access
- large CAD/CAM inputs
- explicit approval UX
- machine-adjacent deployment
- future queue-folder, post, and line-side integrations

---

## 9. Platform Choice Recommendation

## 9.1 Recommended Product Platform

Use a **T3 Code-derived architecture** as the base platform.

### Why this is the right choice

1. **Codex-native session integration**
   - T3 Code already uses a local server process that launches Codex App Server and manages interactive provider sessions.

2. **Reused authentication model**
   - The product can benefit from existing `codex login` behavior instead of inventing a new auth stack for local operator AI assistance.

3. **Desktop packaging**
   - Electron is appropriate for Windows shop-floor or engineering workstation deployment.

4. **Separation of concerns**
   - React UI, local orchestration server, and shared contracts provide a clean growth path.

5. **Local filesystem access**
   - Directory-first project handling is much easier in a desktop/local-server architecture than in a browser-only application.

6. **Future machine-adjacent integration**
   - Local services are a better base for queue folders, network shares, machine posts, and later machine communication.

## 9.2 Why Not a Browser-Only App First

A browser-only architecture is a poor first fit because this product requires:
- local folder access
- large file handling
- trusted machine-side output
- future post/queue integration
- low-friction Codex local integration

## 9.3 Why Not a Fully Cloud-Native CAM Platform First

A cloud-first implementation would increase complexity too early:
- data transfer overhead for CAD/CAM assets
- higher latency for local workflows
- more difficult machine-side deployment
- unnecessary auth and storage complexity before product fit is proven

---

## 10. Proposed Repository / Workspace Architecture

If the current Cut2Kit fork already closely matches T3 Code, preserve the base monorepo and add domain packages rather than rewriting the platform.

### Recommended structure

```text
apps/
  desktop/          # Electron shell
  server/           # Local orchestration server, AI process manager, project scanning
  web/              # React UI
packages/
  contracts/        # Shared API contracts
  shared/           # Shared utils
  project/          # Project scanning, file indexing, settings validation
  dxf/              # DXF adapters and normalization
  geometry/         # Core geometry and coordinate normalization
  framing/          # Stud/joist/opening rules engine
  panelization/     # Panel break logic
  nesting/          # Nest planning domain
  cam/              # Queue and NC generation
  machine-profiles/ # Router/machine profiles and post placeholders
  agent/            # Agent context building, prompts, approvals
```

### Architectural rule

Keep domain logic out of the React UI. The UI should render state, trigger actions, and present agent interactions. The durable business logic should live in packages.

---

## 11. Domain Model Proposal

## 11.1 Core Entities

### Project
- project ID
- root path
- customer
- house/job name
- production mode
- file inventory
- validation status

### SourceDocument
- path
- type
- subtype
- revision fingerprint
- extracted metadata

### FramingRuleSet
- stud spacing
- joist spacing
- reference origin
- opening policies
- seam rules
- allowances

### ElevationAssembly
- source document references
- side/type classification
- normalized geometry references

### StructuralMember
- member type
- orientation
- position
- spacing rule
- continuity and opening interaction

### Opening
- type
- position
- width/height
- framing impact policy

### PanelCandidate
- geometry reference
- break rationale
- dimensions
- material class
- destination mode

### NestPlan
- stock sheet selection
- panel placements
- utilization estimate
- sequencing metadata

### NCJob
- target machine profile
- queue order
- output file path
- manifest references
- status

### KitGroup
- group ID
- job membership
- sequence priority
- shipping/assembly metadata

---

## 12. Data and Configuration Strategy

## 12.1 Project Settings File

File name recommendation:

```text
cut2kit.settings.json
```

### Goals for the settings file

- human-editable
- source-controlled if needed
- explicit enough for deterministic processing
- extensible without breaking old jobs

### Schema design requirements

- versioned
- defaults supported
- strict validation
- room for customer-specific extensions

## 12.2 Machine Profiles

Machine-specific behaviors should **not** be embedded directly in every project file. Projects should reference a named machine profile, and the machine profile should define:
- stock constraints
- spindle/tool placeholders
- post processor ID
- queue output conventions

---

## 13. Deterministic Core vs AI Layer

## 13.1 Deterministic Components

These must be fully deterministic and testable:

- project scanning
- schema validation
- unit normalization
- framing-rule application
- panel-break computation
- nesting validation
- queue serialization
- NC file generation
- machine profile resolution

## 13.2 AI-Assisted Components

These can be AI-assisted:

- mapping ambiguous DXF layers
- proposing framing-rule defaults
- converting customer process language into JSON
- suggesting seam strategies
- generating explanations and diagnostics
- summarizing risk and confidence
- proposing queue priorities

## 13.3 Safety Rule

AI may propose; deterministic code disposes.

The production state of the project must be computable from files and approved records, not from hidden prompt history.

---

## 14. Build and Runtime Strategy

## 14.1 Recommended Runtime Stack

- **Desktop shell:** Electron
- **UI:** React + Vite
- **Orchestration server:** Node.js
- **Workspace/package manager:** Bun-compatible monorepo
- **Language:** TypeScript
- **AI runtime:** Codex App Server launched as a local child process
- **Transport between UI and server:** WebSocket or equivalent internal RPC/event channel

## 14.2 Development Environment Assumptions

Align with the T3 Code baseline unless the local fork has already diverged.

Recommended baseline:
- Node.js 24.x
- Bun 1.3.x
- Codex CLI installed locally
- Windows-first desktop support

## 14.3 Build Modes

### Web development mode
- runs UI and local server for fast iteration

### Desktop development mode
- runs Electron shell plus local backend and UI dev server

### Production build mode
- builds web assets
- builds local server
- packages desktop app

---

## 15. Proposed Build Steps

These steps are expressed as **T3-compatible baseline steps**. The Codex implementation pass should verify them against the actual Cut2Kit repo before assuming they are exact.

### Expected baseline scripts to preserve if present
- `bun run dev`
- `bun run dev:server`
- `bun run dev:web`
- `bun run dev:desktop`
- `bun run build`
- `bun run build:desktop`
- `bun run typecheck`
- `bun run lint`
- `bun run test`


## 15.1 Environment Setup

1. Install Node.js 24.x
2. Install Bun 1.3.x
3. Install Codex CLI
4. Authenticate Codex locally
5. Open the Cut2Kit repository

## 15.2 Dependency Installation

```bash
bun install
```

## 15.3 Local Web + Server Development

```bash
bun run dev
```

## 15.4 Desktop Development

```bash
bun run dev:desktop
```

## 15.5 Production Build

```bash
bun run build
```

## 15.6 Desktop Packaging

```bash
bun run build:desktop
```

If a packaging script already exists for Windows distribution, preserve it. If not, add a Windows-target packaging path after the first vertical slice is stable.

## 15.7 Codex Authentication Strategy

For interactive desktop use:
- prefer existing `codex login` flow

For CI or unattended automation later:
- use a managed API key or service auth path rather than interactive login

---

## 16. Proposed Initial Feature Slice

This is the recommended first implementation target.

## 16.1 Scope of Slice 1

### Project and file intake
- open directory
- index files
- detect settings JSON
- detect DXFs
- show left-side explorer

### Settings schema and validation
- define TypeScript schema
- load and validate file
- expose errors in UI
- include sample file

### DXF metadata ingestion
- file presence
- file summary
- layer extraction if library support is practical
- side/type classification

### Domain contracts
- project
- source documents
- framing rules
- panel candidates
- queue manifest
- NC job placeholder

### Output generation
- generate placeholder manifests
- generate placeholder NC files
- write outputs to `output/` directory

### AI integration
- add Cut to Kit Agent panel
- package current project context
- support explanation and JSON rule suggestions
- require explicit approval before edits are applied

## 16.2 Out of Scope for Slice 1

- full geometry-driven production panelization for every case
- real post processor specifics
- final stock optimization
- ERP/MES integration

---

## 17. Acceptance Criteria for Slice 1

1. User can open a project directory in the desktop app
2. App shows DXFs and settings file in a project tree
3. App validates settings against a schema
4. App classifies files and shows warnings/errors
5. App can generate:
   - `panel-manifest.json`
   - `nest-manifest.json`
   - `queue-manifest.json`
   - placeholder `.nc` files
6. App includes a visible Cut to Kit Agent panel
7. Agent can explain the loaded project and propose rule changes
8. Rule changes are not applied without explicit approval
9. Build, lint, and typecheck pass
10. Desktop dev mode works

---

## 18. Test Strategy

## 18.1 Unit Tests

Focus on:
- settings schema validation
- rule resolution
- manifest serialization
- queue ordering
- machine profile selection

## 18.2 Integration Tests

Focus on:
- project directory scan
- load settings + DXF inventory
- generate output artifacts
- agent context packaging

## 18.3 Pilot Test Data

Create fixture projects representing:
- siding elevation
- floor panel set
- roof panel set
- kitting mode
- line-side mode

---

## 19. Risks and Unknowns

1. **DXF variability**
   - Customer DXFs may be inconsistent in layering, naming, and completeness.

2. **Structural truth source**
   - Some framing intent may not be inferable from DXF alone.

3. **Rule complexity**
   - Stud/joist behavior may vary by assembly and customer process.

4. **Nesting complexity**
   - AI can assist strategy, but deterministic validity remains essential.

5. **Post processor unknowns**
   - NC output specifics are still to be defined.

6. **Repository divergence**
   - The local Cut2Kit fork may differ materially from public T3 Code patterns.

---

## 20. Open Product Questions

These questions do not block the first vertical slice, but they should be resolved before production panelization logic is finalized.

1. What exact structural source of truth exists beyond DXF?
   - CSV, ERP export, framing schedule, engineer markup, or manual entry?

2. How are windows and doors encoded today?
   - blocks, layers, polylines, external schedules?

3. What is the first target machine/controller/post for real NC output?

4. What stock-sheet sizes and materials are required per application?
   - siding
   - flooring
   - roofing

5. Which seam rules are mandatory versus preference-based?

6. Should the first release be Windows desktop only?

7. Does line-side queueing need a distinct manifest contract from kitting?

---

## 21. Implementation Plan

## Phase 0 - Reconnaissance
- inspect local repository structure
- identify preserved T3 Code packages/scripts
- document current build and provider wiring
- confirm current Codex integration status

## Phase 1 - Project Model and UI Intake
- project open
- file tree
- settings schema
- validation UI

## Phase 2 - Domain Packages
- framing
- panelization contracts
- queue manifest
- machine profiles

## Phase 3 - DXF and Structural Adapters
- metadata extraction
- layer mapping
- structural reference ingestion

## Phase 4 - Placeholder Output and Queueing
- manifests
- placeholder NC generation
- output folder writing

## Phase 5 - Agent Integration
- Cut to Kit Agent panel
- rule suggestion workflow
- approvals and audit trail

## Phase 6 - Real Geometry and CAM
- deterministic panelization math
- nesting implementation
- post processors

---

## 22. Suggested UX Labels

- **Project Explorer**
- **Project Health**
- **Assembly Classification**
- **Framing Rules**
- **Panelization Preview**
- **Nest Output**
- **Queue Builder**
- **Cut to Kit Agent**
- **Apply Suggested Changes**
- **Generate NC Queue**

---

## 23. Sample Output Files

```text
output/
  manifests/
    panel-manifest.json
    nest-manifest.json
    queue-manifest.json
  nc/
    KIT-0001.nc
    KIT-0002.nc
    LINE-0001.nc
  reports/
    validation-report.md
    generation-summary.md
```

### Placeholder NC Header Example

```text
; Cut2Kit placeholder NC
; Project: triplem-house-001
; Mode: kitting
; Panel: PNL-0001
; MachineProfile: AXYZ-ROUTER-PLACEHOLDER
; Post: pending-definition
```

---

## 24. Sample JSON Strategy

A sample project settings file is provided separately with this scope package. It demonstrates:
- project metadata
- machine profile references
- DXF mapping defaults
- framing rules
- opening behavior
- panelization preferences
- queueing preferences
- AI and approval behavior

---

## 24A. Reference Inputs Used for This Scope

1. User-supplied whiteboard notes:
   - Cut to Kit
   - CAM software
   - DXF panelization
   - elevation
   - line side + kitting
   - AI-powered nesting/panelization
   - queueing
   - labeling

2. User-supplied adjacent engineering brief:
   - IMP and SIP vertical machine brief
   - useful as adjacent production context, but not the primary software scope driver

3. Public context:
   - Triple M Housing operating model and factory-built housing context
   - T3 Code public architecture
   - OpenAI Codex App Server / login model

---

## 25. Recommendation Summary

### Recommended answer to the platform-choice question

Use a **Cut2Kit fork of the T3 Code desktop/local-server architecture** as the product base.

### Recommended answer to the AI/runtime question

Use **Codex App Server through the existing local process model** so the app can reuse existing login/auth behavior, interactive approvals, and streamed agent events. Treat Codex as the AI assistant/orchestration layer, not the source of deterministic geometry truth.

### Recommended answer to the build-steps question

Keep the T3-style monorepo build if the local fork already has it:
- install dependencies
- preserve dev scripts
- preserve desktop build flow
- add Cut2Kit domain packages and screens incrementally
- start with project intake, settings validation, and queue manifest generation

---

## 26. What Success Looks Like

A first successful Cut2Kit release will let an engineer or operator:

1. open a real customer project folder  
2. see all relevant DXFs and settings in one place  
3. load customer-specific framing rules from JSON  
4. validate and understand the project state  
5. generate manifest-driven placeholder queue output  
6. use an in-app AI agent to accelerate setup and troubleshooting  
7. hand the resulting job structure to the next stage of real panelization, nesting, and post development

That is the right first foundation for an AI-first Cut-to-Kit CAM product.
