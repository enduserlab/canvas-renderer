/**
 * Types for the Canvas Knowledge Graph Renderer.
 *
 * Three layers:
 *   1. Graph types — imported from LLM Wiki's graph.json shape
 *   2. Layout types — positions computed by the layout engine
 *   3. Canvas types — JSON Canvas 1.0 output format
 */

// ---------------------------------------------------------------------------
// Graph input types (mirrors LLM Wiki's schema)
// ---------------------------------------------------------------------------

export type MemoryTier = 'working' | 'episodic' | 'semantic' | 'procedural';

export type EdgeType =
	| 'related-to'
	| 'part-of'
	| 'derived-from'
	| 'contradicts'
	| 'supersedes'
	| 'supports'
	| 'example-of'
	| 'prerequisite';

export interface GraphNode {
	filePath: string;
	title: string;
	entityType: string;
	tier: MemoryTier;
	confidence: number;
	community?: number;
}

export interface GraphEdge {
	id: string;
	fromPage: string;
	toPage: string;
	label: string;
	edgeType: EdgeType;
	weight: number;
	color?: string;
}

export interface GraphData {
	version: number;
	nodes: Record<string, GraphNode>;
	edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Layout types
// ---------------------------------------------------------------------------

/** 2D position assigned by the layout engine. */
export interface NodePosition {
	x: number;
	y: number;
}

/** A node with its computed position and dimensions. */
export interface LayoutNode {
	node: GraphNode;
	pos: NodePosition;
	width: number;
	height: number;
}

/** Full layout output ready for the renderer. */
export interface LayoutResult {
	nodes: Map<string, LayoutNode>;
	width: number;
	height: number;
}

/** Which algorithm to use for node placement. */
export type LayoutAlgorithm = 'force-directed' | 'radial' | 'grid';

// ---------------------------------------------------------------------------
// Layout configuration
// ---------------------------------------------------------------------------

export interface LayoutConfig {
	/** Layout algorithm. */
	algorithm: LayoutAlgorithm;
	/** Base node width in canvas units. */
	nodeWidth: number;
	/** Base node height in canvas units. */
	nodeHeight: number;
	/** Space multiplier between nodes. */
	spacing: number;
	/** Number of force iterations (force-directed only). */
	iterations: number;
	/** Ideal spring length between connected nodes. */
	springLength: number;
	/** Repulsive force strength between all nodes. */
	repulsion: number;
	/** Whether to scale node size by edge count (degree). */
	sizeByDegree: boolean;
	/** Whether to group nodes by community. */
	groupByCommunity: boolean;
}

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

/** Maps tiers and entity types to Obsidian canvas color presets. */
export interface ColorScheme {
	/** Tier → canvas color preset "1"–"6" or hex. */
	tierColors: Record<MemoryTier, string>;
	/** Edge type → canvas color preset "1"–"6" or hex. */
	edgeColors: Record<EdgeType, string>;
}

// ---------------------------------------------------------------------------
// JSON Canvas 1.0 output types
// ---------------------------------------------------------------------------

export type CanvasNodeType = 'text' | 'file' | 'link' | 'group';
export type CanvasSide = 'top' | 'right' | 'bottom' | 'left';
export type CanvasEnd = 'none' | 'arrow';

export interface CanvasTextNode {
	id: string;
	type: 'text';
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	text: string;
}

export interface CanvasFileNode {
	id: string;
	type: 'file';
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	file: string;
	subpath?: string;
}

export interface CanvasGroupNode {
	id: string;
	type: 'group';
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	label?: string;
}

export type CanvasNode = CanvasTextNode | CanvasFileNode | CanvasGroupNode;

export interface CanvasEdge {
	id: string;
	fromNode: string;
	fromSide?: CanvasSide;
	fromEnd?: CanvasEnd;
	toNode: string;
	toSide?: CanvasSide;
	toEnd?: CanvasEnd;
	color?: string;
	label?: string;
}

export interface CanvasData {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

// ---------------------------------------------------------------------------
// Render options
// ---------------------------------------------------------------------------

/** What kind of canvas node to generate for wiki pages. */
export type NodeRenderMode = 'file' | 'text';

export interface RenderOptions {
	/** Use file embeds or text cards. */
	nodeMode: NodeRenderMode;
	/** Show edge labels. */
	showEdgeLabels: boolean;
	/** Show confidence in text nodes. */
	showConfidence: boolean;
	/** Show tier badge in text nodes. */
	showTier: boolean;
	/** Show community groups as canvas group nodes. */
	showCommunityGroups: boolean;
	/** Minimum confidence to include a node (0–1). */
	minConfidence: number;
	/** Only include these tiers (empty = all). */
	filterTiers: MemoryTier[];
	/** Only include these entity types (empty = all). */
	filterEntityTypes: string[];
}

// ---------------------------------------------------------------------------
// Plugin settings
// ---------------------------------------------------------------------------

export interface CanvasRendererSettings {
	/** Vault-relative path to graph.json (from LLM Wiki). */
	graphPath: string;
	/** Vault-relative path where .canvas files are written. */
	outputPath: string;
	/** Default filename for the generated canvas. */
	canvasFilename: string;
	/** Layout configuration. */
	layout: LayoutConfig;
	/** Color scheme. */
	colors: ColorScheme;
	/** Render options. */
	render: RenderOptions;
}

export const DEFAULT_LAYOUT: LayoutConfig = {
	algorithm: 'force-directed',
	nodeWidth: 260,
	nodeHeight: 120,
	spacing: 1.5,
	iterations: 300,
	springLength: 350,
	repulsion: 5000,
	sizeByDegree: true,
	groupByCommunity: true,
};

export const DEFAULT_COLORS: ColorScheme = {
	tierColors: {
		working: '5',      // purple
		episodic: '4',     // yellow
		semantic: '6',     // teal/cyan
		procedural: '1',   // red (highest tier = stands out)
	},
	edgeColors: {
		'related-to': '0',
		'part-of': '6',
		'derived-from': '4',
		'contradicts': '1',
		'supersedes': '2',
		'supports': '3',
		'example-of': '5',
		'prerequisite': '4',
	},
};

export const DEFAULT_RENDER: RenderOptions = {
	nodeMode: 'file',
	showEdgeLabels: true,
	showConfidence: true,
	showTier: true,
	showCommunityGroups: true,
	minConfidence: 0,
	filterTiers: [],
	filterEntityTypes: [],
};

export const DEFAULT_SETTINGS: CanvasRendererSettings = {
	graphPath: '_schema/graph.json',
	outputPath: '',
	canvasFilename: 'Knowledge Graph.canvas',
	layout: DEFAULT_LAYOUT,
	colors: DEFAULT_COLORS,
	render: DEFAULT_RENDER,
};
