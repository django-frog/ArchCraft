# AWS ArchCraft

A browser-based AWS architecture designer with live cost estimates and Well-Architected linting. Design on a React Flow canvas, then export a lossless project file or a compressed share link — no backend required.

## Features

- **AWS service catalog** — drag VPC, Subnet, EC2, RDS, Lambda, S3, and more onto the canvas with container-aware nesting.
- **FinOps estimates** — per-node and total monthly/yearly cost calculations that respect the selected region.
- **Well-Architected Advisor** — live lint findings (security, reliability, cost) with a score, per-node warning badges, and an inspector panel.
- **Lossless project I/O** — export/import `.archcraft.json` with full topology, configs, and security groups. Import via file upload, drag-and-drop, or pasted JSON.
- **Zero-backend sharing** — generate a compressed `#arch=` URL link that auto-loads the architecture on open.
- **Documentation exports** — Markdown specification and Mermaid diagram output.
- **Focus Mode** — hide all panels and canvas controls for clean architecture screenshots (press `Esc` to exit).
- **Local persistence** — work is saved to `sessionStorage` automatically.

## Getting Started

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build the production bundle into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run Oxlint |

## Deployment

The included GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages on every push to `main`. After the first push, enable **Settings → Pages → Build and deployment → Source: GitHub Actions** in your repository. Vite is configured with `base: './'` so asset paths work on project Pages sites.

## Author

**Mohammad Hamdan**

- GitHub repository: [django-frog/ArchCraft](https://github.com/django-frog/ArchCraft)
- LinkedIn: [mohammad-hamdan-824963324](https://www.linkedin.com/in/mohammad-hamdan-824963324/)
