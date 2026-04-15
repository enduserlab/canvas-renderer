# Canvas Knowledge Graph

An Obsidian plugin that reads a JSON knowledge graph and renders it as a native Obsidian canvas — spatial layout, colored tiers, typed edges, live file embeds. Built to pair with [LLM Wiki](https://github.com/enduserlab/llm-wiki), but works with any graph file that matches the expected schema.

## How it works

1. Reads a `graph.json` file from your vault (by default produced by LLM Wiki at `_schema/graph.json`).
2. Computes a spatial layout using one of three algorithms: force-directed, radial tiers, or grid-by-type.
3. Writes a standard Obsidian `.canvas` file with positioned nodes and typed edges.
4. Opens the canvas so you can pan, zoom, and click straight through to the underlying notes.

Because the output is a real `.canvas` file, everything you'd expect from Obsidian canvas works — live file previews, manual edits, selection, search, linking into other notes.

## Commands

- **Render full knowledge graph** — lay out and render every node in the graph
- **Render graph filtered by tier** — pick a memory tier (working, episodic, semantic, procedural)
- **Render graph filtered by entity type** — pick any entity type present in the graph
- **Render neighbourhood of current note** — render a 1-hop subgraph centered on the open page
- **Open last rendered canvas** — jump back to the most recent output
- **Show graph statistics** — counts by tier, entity type, and average confidence

## Layout algorithms

| Algorithm        | When to use                                                    |
|------------------|----------------------------------------------------------------|
| Force-directed   | Organic clusters, good default for exploratory browsing        |
| Radial           | Tier-centric view — each memory tier becomes a concentric ring |
| Grid             | Categorical view — nodes grouped into columns by entity type   |

All three support grouping by community, scaling nodes by connection count, and a configurable spring length / repulsion for the force-directed case.

## Appearance

Nodes can render as either:

- **File embed** — a live, interactive Obsidian preview of the underlying wiki page
- **Text card** — a compact summary card with title, tier badge, and confidence score

Edges are colored by type (`related-to`, `part-of`, `derived-from`, `contradicts`, `supersedes`, `supports`, `example-of`, `prerequisite`) and can optionally show their relationship label.

## Setup

### Prerequisites

- Obsidian 1.5.0+
- A `graph.json` file somewhere in your vault. [LLM Wiki](https://github.com/enduserlab/llm-wiki) produces one automatically, or you can author your own — see the schema below.

### Install

1. Copy the `canvas-renderer` folder into your vault's `.obsidian/plugins/` directory
2. Run `npm install && npm run build` inside the plugin folder
3. Enable "Canvas Knowledge Graph" in Obsidian Settings → Community Plugins
4. Open the plugin settings and confirm the path to your `graph.json`
5. Run the "Render full knowledge graph" command

## Graph schema

The plugin expects a JSON file with this shape:

```json
{
  "version": "1.0",
  "nodes": {
    "wiki/retrieval-augmented-generation.md": {
      "title": "Retrieval-augmented generation",
      "entityType": "concept",
      "tier": "semantic",
      "confidence": 0.78,
      "community": "llm-architecture"
    }
  },
  "edges": [
    {
      "fromPage": "wiki/retrieval-augmented-generation.md",
      "toPage": "wiki/vector-databases.md",
      "relation": "related-to",
      "label": "uses"
    }
  ]
}
```

Node paths double as unique IDs and as vault paths for file embeds.

## Settings

| Setting                | Default                          | Description                                              |
|------------------------|----------------------------------|----------------------------------------------------------|
| Graph data file        | `_schema/graph.json`             | Vault-relative path to the graph JSON                    |
| Canvas output folder   | —                                | Where generated canvas files land                        |
| Canvas filename        | `knowledge-graph.canvas`         | Default filename for the full graph                      |
| Layout algorithm       | Force-directed                   | Force-directed, radial, or grid                          |
| Node width / height    | 400 × 180                        | Base card dimensions in pixels                           |
| Spacing multiplier     | 1.0                              | Spreads nodes further apart when increased               |
| Force iterations       | 200                              | More iterations means cleaner layout, slower render      |
| Spring length          | 300                              | Ideal distance between connected nodes                   |
| Repulsion              | 6000                             | Push strength between unconnected nodes                  |
| Scale by connections   | On                               | Heavily-connected nodes render larger                    |
| Group by community     | On                               | Cluster nodes that share a community ID                  |
| Node style             | File embed                       | Live previews or summary text cards                      |
| Show edge labels       | On                               | Display relationship labels on arrows                    |
| Show confidence / tier | On                               | Show badges on text cards                                |
| Minimum confidence     | 0.0                              | Hide nodes below this threshold                          |
| Filter tiers / types   | —                                | Comma-separated include lists                            |

## Pairing with LLM Wiki

[LLM Wiki](https://github.com/enduserlab/llm-wiki) maintains the graph automatically as you ingest, lint, and crystallize sources. Install both plugins and the canvas stays in sync with your wiki as it grows.

## Development

```bash
cd canvas-renderer
npm install
npm run dev    # watch mode — rebuilds on save
```

Symlink the plugin folder into your test vault's `.obsidian/plugins/` directory. Reload Obsidian (Ctrl+R / Cmd+R) after rebuilds.

## License

MIT
