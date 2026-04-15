/**
 * Graph layout engine — computes 2D positions for knowledge graph nodes.
 *
 * Three algorithms:
 *   - force-directed: Fruchterman-Reingold with spring attraction + node
 *     repulsion.  Best for organic, exploratory graphs.
 *   - radial: Concentric rings by tier (procedural at center, working at
 *     edge).  Good for showing memory hierarchy.
 *   - grid: Simple left-to-right grid grouped by entity type.  Deterministic
 *     fallback for very large graphs.
 *
 * All algorithms are pure functions — no Obsidian API dependency — so they
 * can be tested independently.
 */

import {
	GraphData,
	GraphNode,
	GraphEdge,
	LayoutConfig,
	LayoutResult,
	LayoutNode,
	NodePosition,
	MemoryTier,
} from './types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeLayout(
	graph: GraphData,
	config: LayoutConfig,
): LayoutResult {
	const nodes = Object.values(graph.nodes);
	if (nodes.length === 0) {
		return { nodes: new Map(), width: 0, height: 0 };
	}

	const degrees = computeDegrees(nodes, graph.edges);

	let positions: Map<string, NodePosition>;
	switch (config.algorithm) {
		case 'radial':
			positions = radialLayout(nodes, config);
			break;
		case 'grid':
			positions = gridLayout(nodes, config);
			break;
		case 'force-directed':
		default:
			positions = forceDirectedLayout(nodes, graph.edges, config);
			break;
	}

	// Build LayoutNode map with dimensions
	const result = new Map<string, LayoutNode>();
	let maxX = 0;
	let maxY = 0;

	for (const node of nodes) {
		const pos = positions.get(node.filePath);
		if (!pos) continue;

		const degree = degrees.get(node.filePath) ?? 0;
		const scale = config.sizeByDegree
			? Math.min(2.0, 1.0 + degree * 0.1)
			: 1.0;

		const width = Math.round(config.nodeWidth * scale);
		const height = Math.round(config.nodeHeight * scale);

		result.set(node.filePath, { node, pos, width, height });

		maxX = Math.max(maxX, pos.x + width);
		maxY = Math.max(maxY, pos.y + height);
	}

	return { nodes: result, width: maxX, height: maxY };
}

// ---------------------------------------------------------------------------
// Force-directed (Fruchterman-Reingold)
// ---------------------------------------------------------------------------

function forceDirectedLayout(
	nodes: GraphNode[],
	edges: GraphEdge[],
	config: LayoutConfig,
): Map<string, NodePosition> {
	const n = nodes.length;
	const area = config.springLength * config.springLength * n;
	const k = Math.sqrt(area / n);  // ideal distance

	// Build adjacency index
	const adj = new Map<string, Set<string>>();
	for (const node of nodes) adj.set(node.filePath, new Set());
	for (const e of edges) {
		adj.get(e.fromPage)?.add(e.toPage);
		adj.get(e.toPage)?.add(e.fromPage);
	}

	// Initialize positions — community-aware seeding if available
	const pos = new Map<string, { x: number; y: number }>();
	if (config.groupByCommunity && nodes.some(n => n.community !== undefined)) {
		seedByCommunity(nodes, pos, config);
	} else {
		// Random circular spread
		for (let i = 0; i < n; i++) {
			const angle = (2 * Math.PI * i) / n;
			const r = k * Math.sqrt(n) * 0.5;
			pos.set(nodes[i].filePath, {
				x: Math.cos(angle) * r,
				y: Math.sin(angle) * r,
			});
		}
	}

	// Iterate
	const maxDisp = config.springLength * 2;

	for (let iter = 0; iter < config.iterations; iter++) {
		const temp = maxDisp * (1 - iter / config.iterations);

		// Displacement accumulators
		const disp = new Map<string, { dx: number; dy: number }>();
		for (const node of nodes) disp.set(node.filePath, { dx: 0, dy: 0 });

		// Repulsive forces between all pairs
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				const pi = pos.get(nodes[i].filePath)!;
				const pj = pos.get(nodes[j].filePath)!;
				let dx = pi.x - pj.x;
				let dy = pi.y - pj.y;
				const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
				const force = (config.repulsion / (dist * dist));
				dx = (dx / dist) * force;
				dy = (dy / dist) * force;

				const di = disp.get(nodes[i].filePath)!;
				const dj = disp.get(nodes[j].filePath)!;
				di.dx += dx;
				di.dy += dy;
				dj.dx -= dx;
				dj.dy -= dy;
			}
		}

		// Attractive forces along edges
		for (const e of edges) {
			const pFrom = pos.get(e.fromPage);
			const pTo = pos.get(e.toPage);
			if (!pFrom || !pTo) continue;

			let dx = pFrom.x - pTo.x;
			let dy = pFrom.y - pTo.y;
			const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
			const force = (dist * dist) / (k * config.springLength);
			dx = (dx / dist) * force * e.weight;
			dy = (dy / dist) * force * e.weight;

			const dFrom = disp.get(e.fromPage)!;
			const dTo = disp.get(e.toPage)!;
			dFrom.dx -= dx;
			dFrom.dy -= dy;
			dTo.dx += dx;
			dTo.dy += dy;
		}

		// Apply displacements with temperature
		for (const node of nodes) {
			const d = disp.get(node.filePath)!;
			const dist = Math.max(0.01, Math.sqrt(d.dx * d.dx + d.dy * d.dy));
			const capped = Math.min(dist, temp);
			const p = pos.get(node.filePath)!;
			p.x += (d.dx / dist) * capped;
			p.y += (d.dy / dist) * capped;
		}
	}

	// Normalize to positive coordinates with spacing
	return normalizePositions(pos, config);
}

// ---------------------------------------------------------------------------
// Radial layout
// ---------------------------------------------------------------------------

const TIER_ORDER: MemoryTier[] = ['procedural', 'semantic', 'episodic', 'working'];

function radialLayout(
	nodes: GraphNode[],
	config: LayoutConfig,
): Map<string, NodePosition> {
	const byTier = new Map<MemoryTier, GraphNode[]>();
	for (const tier of TIER_ORDER) byTier.set(tier, []);
	for (const node of nodes) {
		const bucket = byTier.get(node.tier) ?? byTier.get('working')!;
		bucket.push(node);
	}

	const pos = new Map<string, NodePosition>();
	const ringGap = config.springLength * config.spacing;

	let ring = 0;
	for (const tier of TIER_ORDER) {
		const tierNodes = byTier.get(tier)!;
		if (tierNodes.length === 0) continue;

		const radius = ring === 0 ? 0 : ring * ringGap;
		for (let i = 0; i < tierNodes.length; i++) {
			const angle = (2 * Math.PI * i) / tierNodes.length;
			pos.set(tierNodes[i].filePath, {
				x: Math.cos(angle) * radius,
				y: Math.sin(angle) * radius,
			});
		}
		ring++;
	}

	return normalizePositions(pos, config);
}

// ---------------------------------------------------------------------------
// Grid layout
// ---------------------------------------------------------------------------

function gridLayout(
	nodes: GraphNode[],
	config: LayoutConfig,
): Map<string, NodePosition> {
	// Group by entity type
	const byType = new Map<string, GraphNode[]>();
	for (const node of nodes) {
		const list = byType.get(node.entityType) ?? [];
		list.push(node);
		byType.set(node.entityType, list);
	}

	const pos = new Map<string, NodePosition>();
	const colWidth = config.nodeWidth * config.spacing + 40;
	const rowHeight = config.nodeHeight * config.spacing + 40;

	let col = 0;
	for (const [, group] of byType) {
		for (let row = 0; row < group.length; row++) {
			pos.set(group[row].filePath, {
				x: col * colWidth,
				y: row * rowHeight,
			});
		}
		col++;
	}

	return pos;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeDegrees(
	nodes: GraphNode[],
	edges: GraphEdge[],
): Map<string, number> {
	const deg = new Map<string, number>();
	for (const n of nodes) deg.set(n.filePath, 0);
	for (const e of edges) {
		deg.set(e.fromPage, (deg.get(e.fromPage) ?? 0) + 1);
		deg.set(e.toPage, (deg.get(e.toPage) ?? 0) + 1);
	}
	return deg;
}

/** Seed positions by clustering community members together. */
function seedByCommunity(
	nodes: GraphNode[],
	pos: Map<string, { x: number; y: number }>,
	config: LayoutConfig,
): void {
	const communities = new Map<number, GraphNode[]>();
	const unclustered: GraphNode[] = [];

	for (const node of nodes) {
		if (node.community !== undefined) {
			const list = communities.get(node.community) ?? [];
			list.push(node);
			communities.set(node.community, list);
		} else {
			unclustered.push(node);
		}
	}

	const commIds = [...communities.keys()].sort((a, b) => a - b);
	const commCount = commIds.length + (unclustered.length > 0 ? 1 : 0);
	const megaRadius = config.springLength * Math.sqrt(nodes.length) * 0.5;

	let ci = 0;
	for (const commId of commIds) {
		const members = communities.get(commId)!;
		const cx = Math.cos((2 * Math.PI * ci) / commCount) * megaRadius;
		const cy = Math.sin((2 * Math.PI * ci) / commCount) * megaRadius;
		const localR = config.springLength * Math.sqrt(members.length) * 0.3;

		for (let i = 0; i < members.length; i++) {
			const angle = (2 * Math.PI * i) / members.length;
			pos.set(members[i].filePath, {
				x: cx + Math.cos(angle) * localR,
				y: cy + Math.sin(angle) * localR,
			});
		}
		ci++;
	}

	// Unclustered go in their own ring
	if (unclustered.length > 0) {
		const cx = Math.cos((2 * Math.PI * ci) / commCount) * megaRadius;
		const cy = Math.sin((2 * Math.PI * ci) / commCount) * megaRadius;
		for (let i = 0; i < unclustered.length; i++) {
			const angle = (2 * Math.PI * i) / unclustered.length;
			const r = config.springLength * 0.5;
			pos.set(unclustered[i].filePath, {
				x: cx + Math.cos(angle) * r,
				y: cy + Math.sin(angle) * r,
			});
		}
	}
}

/** Shift all positions so minimums start at 0, apply spacing. */
function normalizePositions(
	raw: Map<string, { x: number; y: number }>,
	config: LayoutConfig,
): Map<string, NodePosition> {
	let minX = Infinity;
	let minY = Infinity;

	for (const p of raw.values()) {
		minX = Math.min(minX, p.x);
		minY = Math.min(minY, p.y);
	}

	const padding = config.nodeWidth;
	const result = new Map<string, NodePosition>();

	for (const [key, p] of raw) {
		result.set(key, {
			x: Math.round((p.x - minX) * config.spacing + padding),
			y: Math.round((p.y - minY) * config.spacing + padding),
		});
	}

	return result;
}
