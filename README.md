# AWS ArchCraft

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Open%20ArchCraft-0ea5e9?style=for-the-badge)](https://django-frog.github.io/ArchCraft/)

A browser-based AWS architecture designer with live cost estimates and Well-Architected linting. Design on a React Flow canvas, then export a lossless project file or a compressed share link — no backend required.

**[🚀 Try the Live Demo](https://django-frog.github.io/ArchCraft/)** · **[GitHub repository](https://github.com/django-frog/ArchCraft)**

## Features

- **Real AWS Pricing Sync** — a weekly GitHub Actions workflow (`scripts/sync-pricing.yml`) runs `scripts/sync-aws-prices.mjs`, pulling authentic AWS On-Demand rates from the public AWS Price List Bulk API into `public/pricing/aws-prices.json`. Every node gets an itemized monthly billing breakdown, and the entire diagram can be re-priced by switching regions.
- **Authentic AWS Networking** — resizable VPC and Public/Private Subnet containers, Availability Zone selection, interactive Subnet Route Tables, and real IPv4 CIDR containment & overlap validation (`src/utils/cidrValidator.ts`). Model Internet Gateways (IGW), Application Load Balancers (ALB), NAT Gateways, and VPC Endpoints (Gateway & Interface).
- **Hardware & FinOps Dimensions** — EC2 (`x86_64` & Graviton `arm64`, On-Demand vs. 1-Yr Savings Plan, root EBS, internet egress), Lambda (`arm64` Graviton discount and ephemeral storage), RDS (Single-AZ / Multi-AZ Instance / Multi-AZ Cluster with backup retention), ElastiCache, DynamoDB, CloudFront, SQS, S3, and EBS (`gp3` IOPS & throughput).
- **Stateful Security Groups & Port Linting** — define inbound and outbound rules by CIDR or by chaining another Security Group, then attach groups to EC2, RDS, ElastiCache, ALB, and Interface VPC Endpoints. Live validation checks every connection's port against the target's inbound rules (`SEC-06`).
- **Well-Architected Linter** — a real-time `0–100` health score and slide-over Advisor drawer covering Security, Reliability, Networking, and FinOps rules, with per-node finding badges and actionable remediation.
- **Zero-Backend Sharing & Exports** — lossless `#arch=` LZ-string URL hash sharing that preserves exact container dimensions and viewport zoom, `.archcraft.json` import/export (file upload, drag-and-drop, or pasted JSON), and a Markdown specification with a bill-of-materials table, VPC Route Tables, a Security Group firewall matrix, a Well-Architected review, and a Mermaid diagram.
- **Canvas UX** — Focus Mode for clean screenshots, keyboard copy/paste/duplicate (`Ctrl+C` / `Ctrl+V` / `Ctrl+D`), smart default ports when connecting services, animated dashed-flow toggles, and reconnectable edges.
- **Local persistence** — work is saved to `sessionStorage` automatically.

## Getting Started

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To refresh the bundled AWS On-Demand pricing data from the public AWS Price List Bulk API:

```bash
npm run sync-prices
```

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build the production bundle into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run Oxlint |
| `npm run sync-prices` | Refresh `public/pricing/aws-prices.json` from the AWS Price List Bulk API |

## Project Structure

```text
aws-archcraft/
├── .github/workflows/
│   ├── deploy.yml                 # GitHub Pages build & deploy
│   └── sync-pricing.yml           # Weekly AWS pricing refresh
├── public/
│   ├── favicon.svg
│   └── pricing/
│       └── aws-prices.json        # Synced On-Demand rates (fallback data is built in)
├── scripts/
│   └── sync-aws-prices.mjs        # Zero-backend price synchronizer
├── src/
│   ├── components/
│   │   ├── inspector/
│   │   │   ├── EdgeInspector.tsx
│   │   │   ├── NodeAdvisorSection.tsx
│   │   │   └── NodeConfigFields.tsx
│   │   ├── nodes/
│   │   │   ├── ContainerNode.tsx
│   │   │   ├── FindingBadge.tsx
│   │   │   └── ServiceNode.tsx
│   │   ├── AdvisorDrawer.tsx
│   │   ├── CanvasBoard.tsx
│   │   ├── ExportModal.tsx
│   │   ├── ImportModal.tsx
│   │   ├── InspectorPanel.tsx
│   │   ├── SecurityGroupModal.tsx
│   │   ├── ShareModal.tsx
│   │   ├── Sidebar.tsx
│   │   └── TopToolbar.tsx
│   ├── data/
│   │   ├── awsCatalog.ts          # Service definitions, defaults & cost formulas
│   │   ├── pricingData.ts         # Region rates & built-in fallbacks
│   │   └── starterTemplates.ts    # Blank / 3-tier / serverless templates
│   ├── hooks/
│   │   └── useArchitectureLint.ts
│   ├── store/
│   │   └── useArchStore.ts        # Zustand state, persistence & actions
│   ├── types/
│   │   └── architecture.ts
│   ├── utils/
│   │   ├── architectureLinter.ts  # Well-Architected rules & score inputs
│   │   ├── cidrValidator.ts       # IPv4 CIDR containment & overlap checks
│   │   ├── exportGenerator.ts     # Markdown spec & Mermaid diagram
│   │   └── projectSerializer.ts   # .archcraft.json & #arch= share links
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
└── README.md
```

## Deployment

The included GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages on every push to `main`. After the first push, enable **Settings → Pages → Build and deployment → Source: GitHub Actions** in your repository. Vite is configured with `base: './'` so asset paths work on project Pages sites.

## Author

**Mohammad Hamdan**

- GitHub repository: [django-frog/ArchCraft](https://github.com/django-frog/ArchCraft)
- LinkedIn: [mohammad-hamdan-824963324](https://www.linkedin.com/in/mohammad-hamdan-824963324/)
