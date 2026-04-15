/**
 * Canvas Knowledge Graph — Obsidian plugin entry point.
 *
 * Reads the LLM Wiki's graph.json, computes a spatial layout, and writes
 * a .canvas file that Obsidian renders natively.
 *
 * Commands:
 *   - Render full graph
 *   - Render by tier (pick one)
 *   - Render by entity type (pick one)
 *   - Render neighbourhood (select a node, render its 1-hop subgraph)
 *   - Open last rendered canvas
 */

import {
	App,
	FuzzySuggestModal,
	Notice,
	Plugin,
	TFile,
	normalizePath,
} from 'obsidian';

import {
	CanvasRendererSettings,
	DEFAULT_SETTINGS,
	DEFAULT_LAYOUT,
	DEFAULT_COLORS,
	DEFAULT_RENDER,
	GraphData,
	GraphNode,
	GraphEdge,
	CanvasData,
	MemoryTier,
} from './types';

import { computeLayout } from './layout';
import { renderCanvas } from './renderer';
import { CanvasRendererSettingTab } from './settings';

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default class CanvasKnowledgeGraphPlugin extends Plugin {
	settings: CanvasRendererSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new CanvasRendererSettingTab(this.app, this));

		// Ribbon icon
		this.addRibbonIcon('layout-grid', 'Render knowledge graph', () => {
			this.renderFullGraph();
		});

		// --- Commands --------------------------------------------------------

		this.addCommand({
			id: 'render-full-graph',
			name: 'Render full knowledge graph',
			callback: () => this.renderFullGraph(),
		});

		this.addCommand({
			id: 'render-by-tier',
			name: 'Render graph filtered by tier',
			callback: () => this.renderByTier(),
		});

		this.addCommand({
			id: 'render-by-entity-type',
			name: 'Render graph filtered by entity type',
			callback: () => this.renderByEntityType(),
		});

		this.addCommand({
			id: 'render-neighbourhood',
			name: 'Render neighbourhood of current note',
			callback: () => this.renderNeighbourhood(),
		});

		this.addCommand({
			id: 'open-canvas',
			name: 'Open last rendered canvas',
			callback: () => this.openCanvas(),
		});

		this.addCommand({
			id: 'render-stats',
			name: 'Show graph statistics',
			callback: () => this.showStats(),
		});
	}

	// -----------------------------------------------------------------------
	// Settings
	// -----------------------------------------------------------------------

	async loadSettings(): Promise<void> {
		const loaded = await this.loadData();
		this.settings = {
			...DEFAULT_SETTINGS,
			...loaded,
			layout: { ...DEFAULT_LAYOUT, ...(loaded?.layout ?? {}) },
			colors: {
				tierColors: { ...DEFAULT_COLORS.tierColors, ...(loaded?.colors?.tierColors ?? {}) },
				edgeColors: { ...DEFAULT_COLORS.edgeColors, ...(loaded?.colors?.edgeColors ?? {}) },
			},
			render: { ...DEFAULT_RENDER, ...(loaded?.render ?? {}) },
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// -----------------------------------------------------------------------
	// Graph loading
	// -----------------------------------------------------------------------

	private async loadGraph(): Promise<GraphData | null> {
		const path = normalizePath(this.settings.graphPath);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(`Graph not found at ${path} — run wiki ingest first.`);
			return null;
		}
		try {
			const raw = await this.app.vault.read(file);
			return JSON.parse(raw) as GraphData;
		} catch (e) {
			new Notice('Failed to parse graph.json — the file may be corrupt.');
			console.error('graph parse error', e);
			return null;
		}
	}

	// -----------------------------------------------------------------------
	// Render commands
	// -----------------------------------------------------------------------

	private async renderFullGraph(): Promise<void> {
		const graph = await this.loadGraph();
		if (!graph) return;

		const nodeCount = Object.keys(graph.nodes).length;
		if (nodeCount === 0) {
			new Notice('Knowledge graph is empty — ingest some sources first.');
			return;
		}

		new Notice(`Laying out ${nodeCount} nodes and ${graph.edges.length} edges...`);

		const layout = computeLayout(graph, this.settings.layout);
		const canvas = renderCanvas(graph, layout, this.settings.colors, this.settings.render);

		const filename = this.settings.canvasFilename;
		await this.writeCanvas(canvas, filename);
		new Notice(`Canvas written: ${filename}`);
		await this.openCanvasByName(filename);
	}

	private async renderByTier(): Promise<void> {
		const graph = await this.loadGraph();
		if (!graph) return;

		// Collect available tiers
		const tiers = new Set<MemoryTier>();
		for (const node of Object.values(graph.nodes)) {
			tiers.add(node.tier);
		}

		if (tiers.size === 0) {
			new Notice('No nodes in the graph.');
			return;
		}

		const ordered = (['procedural', 'semantic', 'episodic', 'working'] as MemoryTier[])
			.filter(t => tiers.has(t));

		new PickerModal<MemoryTier>(
			this.app,
			'Pick a tier to render',
			ordered,
			t => t,
			async (tier) => {
				const sub = filterGraph(graph, n => n.tier === tier);
				const layout = computeLayout(sub, this.settings.layout);
				const canvas = renderCanvas(sub, layout, this.settings.colors, this.settings.render);
				const filename = `Knowledge Graph — ${tier}.canvas`;
				await this.writeCanvas(canvas, filename);
				new Notice(`Canvas written: ${filename}`);
				await this.openCanvasByName(filename);
			},
		).open();
	}

	private async renderByEntityType(): Promise<void> {
		const graph = await this.loadGraph();
		if (!graph) return;

		const types = new Set<string>();
		for (const node of Object.values(graph.nodes)) {
			types.add(node.entityType);
		}

		if (types.size === 0) {
			new Notice('No nodes in the graph.');
			return;
		}

		const sorted = [...types].sort();

		new PickerModal<string>(
			this.app,
			'Pick an entity type to render',
			sorted,
			t => t,
			async (entityType) => {
				const sub = filterGraph(graph, n => n.entityType === entityType);
				const layout = computeLayout(sub, this.settings.layout);
				const canvas = renderCanvas(sub, layout, this.settings.colors, this.settings.render);
				const filename = `Knowledge Graph — ${entityType}.canvas`;
				await this.writeCanvas(canvas, filename);
				new Notice(`Canvas written: ${filename}`);
				await this.openCanvasByName(filename);
			},
		).open();
	}

	private async renderNeighbourhood(): Promise<void> {
		const graph = await this.loadGraph();
		if (!graph) return;

		// Get active file
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file — open a wiki page first.');
			return;
		}

		const centerPath = activeFile.path;
		const centerNode = graph.nodes[centerPath];
		if (!centerNode) {
			new Notice(`${activeFile.basename} is not in the knowledge graph.`);
			return;
		}

		// Collect 1-hop neighbours
		const neighbourPaths = new Set<string>([centerPath]);
		const neighbourEdges: GraphEdge[] = [];

		for (const edge of graph.edges) {
			if (edge.fromPage === centerPath) {
				neighbourPaths.add(edge.toPage);
				neighbourEdges.push(edge);
			} else if (edge.toPage === centerPath) {
				neighbourPaths.add(edge.fromPage);
				neighbourEdges.push(edge);
			}
		}

		// Also include edges among neighbours
		for (const edge of graph.edges) {
			if (neighbourPaths.has(edge.fromPage) && neighbourPaths.has(edge.toPage)) {
				if (!neighbourEdges.includes(edge)) {
					neighbourEdges.push(edge);
				}
			}
		}

		const subNodes: Record<string, GraphNode> = {};
		for (const p of neighbourPaths) {
			if (graph.nodes[p]) subNodes[p] = graph.nodes[p];
		}

		const subGraph: GraphData = {
			version: graph.version,
			nodes: subNodes,
			edges: neighbourEdges,
		};

		const layout = computeLayout(subGraph, this.settings.layout);
		const canvas = renderCanvas(subGraph, layout, this.settings.colors, this.settings.render);
		const filename = `Neighbourhood — ${centerNode.title}.canvas`;
		await this.writeCanvas(canvas, filename);
		new Notice(`Neighbourhood canvas: ${Object.keys(subNodes).length} nodes`);
		await this.openCanvasByName(filename);
	}

	private async showStats(): Promise<void> {
		const graph = await this.loadGraph();
		if (!graph) return;

		const nodes = Object.values(graph.nodes);
		const tierCounts: Record<string, number> = {};
		const typeCounts: Record<string, number> = {};
		let totalConf = 0;

		for (const node of nodes) {
			tierCounts[node.tier] = (tierCounts[node.tier] ?? 0) + 1;
			typeCounts[node.entityType] = (typeCounts[node.entityType] ?? 0) + 1;
			totalConf += node.confidence;
		}

		const avgConf = nodes.length > 0 ? (totalConf / nodes.length).toFixed(2) : '0';

		const lines = [
			`Knowledge Graph Stats`,
			`─────────────────────`,
			`Nodes: ${nodes.length}`,
			`Edges: ${graph.edges.length}`,
			`Avg confidence: ${avgConf}`,
			``,
			`By tier:`,
			...Object.entries(tierCounts).map(([t, c]) => `  ${t}: ${c}`),
			``,
			`By entity type:`,
			...Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([t, c]) => `  ${t}: ${c}`),
		];

		new Notice(lines.join('\n'), 15000);
	}

	// -----------------------------------------------------------------------
	// Canvas I/O
	// -----------------------------------------------------------------------

	private async writeCanvas(data: CanvasData, filename: string): Promise<void> {
		const dir = this.settings.outputPath
			? normalizePath(this.settings.outputPath)
			: '';
		const fullPath = dir
			? normalizePath(`${dir}/${filename}`)
			: normalizePath(filename);

		// Ensure output directory exists
		if (dir) {
			await this.ensureFolder(dir);
		}

		const content = JSON.stringify(data, null, '\t');
		const existing = this.app.vault.getAbstractFileByPath(fullPath);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
		} else {
			await this.app.vault.create(fullPath, content);
		}
	}

	private async openCanvas(): Promise<void> {
		await this.openCanvasByName(this.settings.canvasFilename);
	}

	private async openCanvasByName(filename: string): Promise<void> {
		const dir = this.settings.outputPath
			? normalizePath(this.settings.outputPath)
			: '';
		const fullPath = dir
			? normalizePath(`${dir}/${filename}`)
			: normalizePath(filename);

		const file = this.app.vault.getAbstractFileByPath(fullPath);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(file);
		}
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const normalized = normalizePath(folderPath);
		const existing = this.app.vault.getAbstractFileByPath(normalized);
		if (!existing) {
			await this.app.vault.createFolder(normalized);
		}
	}
}

// ---------------------------------------------------------------------------
// Graph filtering helper
// ---------------------------------------------------------------------------

function filterGraph(
	graph: GraphData,
	predicate: (node: GraphNode) => boolean,
): GraphData {
	const nodes: Record<string, GraphNode> = {};
	for (const [path, node] of Object.entries(graph.nodes)) {
		if (predicate(node)) nodes[path] = node;
	}

	const nodePaths = new Set(Object.keys(nodes));
	const edges = graph.edges.filter(
		e => nodePaths.has(e.fromPage) && nodePaths.has(e.toPage)
	);

	return { version: graph.version, nodes, edges };
}

// ---------------------------------------------------------------------------
// Generic picker modal
// ---------------------------------------------------------------------------

class PickerModal<T> extends FuzzySuggestModal<T> {
	private items: T[];
	private labelFn: (item: T) => string;
	private onPick: (item: T) => void | Promise<void>;

	constructor(
		app: App,
		placeholder: string,
		items: T[],
		labelFn: (item: T) => string,
		onPick: (item: T) => void | Promise<void>,
	) {
		super(app);
		this.items = items;
		this.labelFn = labelFn;
		this.onPick = onPick;
		this.setPlaceholder(placeholder);
	}

	getItems(): T[] {
		return this.items;
	}

	getItemText(item: T): string {
		return this.labelFn(item);
	}

	onChooseItem(item: T): void {
		void this.onPick(item);
	}
}
