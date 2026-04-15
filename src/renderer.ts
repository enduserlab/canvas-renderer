/**
 * Canvas renderer — converts a LayoutResult + GraphData into a JSON
 * Canvas 1.0 document that Obsidian can open natively.
 *
 * Supports two node modes:
 *   - "file": Each node is a CanvasFileNode pointing at the wiki .md file.
 *     Obsidian renders a live preview of the note inside the canvas card.
 *   - "text": Each node is a CanvasTextNode with a markdown summary
 *     (title, tier badge, confidence bar, entity type).
 *
 * Edges map 1:1 from GraphEdge → CanvasEdge with label, color, and
 * directional arrows.
 *
 * When `showCommunityGroups` is on, the renderer creates CanvasGroupNodes
 * that visually cluster nodes sharing a community ID.
 */

import {
	GraphData,
	GraphEdge,
	LayoutResult,
	LayoutNode,
	RenderOptions,
	ColorScheme,
	MemoryTier,
	EdgeType,
	CanvasData,
	CanvasNode,
	CanvasTextNode,
	CanvasFileNode,
	CanvasGroupNode,
	CanvasEdge,
	CanvasSide,
} from './types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderCanvas(
	graph: GraphData,
	layout: LayoutResult,
	colors: ColorScheme,
	options: RenderOptions,
): CanvasData {
	const canvasNodes: CanvasNode[] = [];
	const canvasEdges: CanvasEdge[] = [];

	// --- Community groups (rendered first so they sit behind cards) ----------
	if (options.showCommunityGroups) {
		const groups = buildCommunityGroups(layout, colors);
		canvasNodes.push(...groups);
	}

	// --- Nodes ---------------------------------------------------------------
	for (const [filePath, ln] of layout.nodes) {
		// Apply filters
		if (ln.node.confidence < options.minConfidence) continue;
		if (options.filterTiers.length > 0 && !options.filterTiers.includes(ln.node.tier)) continue;
		if (options.filterEntityTypes.length > 0 && !options.filterEntityTypes.includes(ln.node.entityType)) continue;

		const nodeId = makeNodeId(filePath);
		const color = tierColor(ln.node.tier, colors);

		if (options.nodeMode === 'file') {
			const fileNode: CanvasFileNode = {
				id: nodeId,
				type: 'file',
				x: ln.pos.x,
				y: ln.pos.y,
				width: ln.width,
				height: ln.height,
				color,
				file: ln.node.filePath,
			};
			canvasNodes.push(fileNode);
		} else {
			const text = buildTextContent(ln, options);
			const textNode: CanvasTextNode = {
				id: nodeId,
				type: 'text',
				x: ln.pos.x,
				y: ln.pos.y,
				width: ln.width,
				height: ln.height,
				color,
				text,
			};
			canvasNodes.push(textNode);
		}
	}

	// Build set of rendered node IDs for edge filtering
	const renderedNodeIds = new Set<string>();
	for (const n of canvasNodes) {
		if (n.type !== 'group') renderedNodeIds.add(n.id);
	}

	// --- Edges ---------------------------------------------------------------
	for (const edge of graph.edges) {
		const fromId = makeNodeId(edge.fromPage);
		const toId = makeNodeId(edge.toPage);

		// Only render edges where both endpoints are visible
		if (!renderedNodeIds.has(fromId) || !renderedNodeIds.has(toId)) continue;

		const canvasEdge: CanvasEdge = {
			id: `edge-${edge.id}`,
			fromNode: fromId,
			toNode: toId,
			fromSide: chooseSide(layout, edge.fromPage, edge.toPage),
			toSide: chooseSide(layout, edge.toPage, edge.fromPage),
			toEnd: 'arrow',
			color: edgeColor(edge.edgeType, colors),
		};

		if (options.showEdgeLabels && edge.label) {
			canvasEdge.label = edge.label;
		}

		canvasEdges.push(canvasEdge);
	}

	return { nodes: canvasNodes, edges: canvasEdges };
}

// ---------------------------------------------------------------------------
// Text content builder
// ---------------------------------------------------------------------------

function buildTextContent(ln: LayoutNode, options: RenderOptions): string {
	const parts: string[] = [];
	parts.push(`# ${ln.node.title}`);

	const meta: string[] = [];
	if (options.showTier) {
		meta.push(tierBadge(ln.node.tier));
	}
	if (options.showConfidence) {
		meta.push(confidenceBar(ln.node.confidence));
	}
	meta.push(`*${ln.node.entityType}*`);

	if (meta.length > 0) {
		parts.push(meta.join(' · '));
	}

	parts.push(`\n[[${ln.node.filePath.replace(/\.md$/, '')}|Open page →]]`);

	return parts.join('\n');
}

function tierBadge(tier: MemoryTier): string {
	const icons: Record<MemoryTier, string> = {
		working: '🔵 working',
		episodic: '🟡 episodic',
		semantic: '🟢 semantic',
		procedural: '🔴 procedural',
	};
	return icons[tier];
}

function confidenceBar(value: number): string {
	const pct = Math.round(value * 100);
	const filled = Math.round(value * 5);
	const bar = '█'.repeat(filled) + '░'.repeat(5 - filled);
	return `${bar} ${pct}%`;
}

// ---------------------------------------------------------------------------
// Community groups
// ---------------------------------------------------------------------------

function buildCommunityGroups(
	layout: LayoutResult,
	colors: ColorScheme,
): CanvasGroupNode[] {
	const communities = new Map<number, LayoutNode[]>();

	for (const ln of layout.nodes.values()) {
		const comm = ln.node.community;
		if (comm === undefined) continue;
		const list = communities.get(comm) ?? [];
		list.push(ln);
		communities.set(comm, list);
	}

	const groups: CanvasGroupNode[] = [];
	const padding = 40;

	for (const [commId, members] of communities) {
		if (members.length < 2) continue;

		let minX = Infinity, minY = Infinity;
		let maxX = -Infinity, maxY = -Infinity;

		for (const ln of members) {
			minX = Math.min(minX, ln.pos.x);
			minY = Math.min(minY, ln.pos.y);
			maxX = Math.max(maxX, ln.pos.x + ln.width);
			maxY = Math.max(maxY, ln.pos.y + ln.height);
		}

		// Determine dominant tier in this community for coloring
		const tierCounts = new Map<MemoryTier, number>();
		for (const ln of members) {
			tierCounts.set(ln.node.tier, (tierCounts.get(ln.node.tier) ?? 0) + 1);
		}
		let dominantTier: MemoryTier = 'working';
		let maxCount = 0;
		for (const [tier, count] of tierCounts) {
			if (count > maxCount) { dominantTier = tier; maxCount = count; }
		}

		groups.push({
			id: `group-community-${commId}`,
			type: 'group',
			x: minX - padding,
			y: minY - padding,
			width: (maxX - minX) + padding * 2,
			height: (maxY - minY) + padding * 2,
			color: tierColor(dominantTier, colors),
			label: `Community ${commId}`,
		});
	}

	return groups;
}

// ---------------------------------------------------------------------------
// Edge routing
// ---------------------------------------------------------------------------

/**
 * Pick which side of `from` the edge should leave based on the relative
 * position of `to`.  Prefers horizontal routing.
 */
function chooseSide(
	layout: LayoutResult,
	from: string,
	to: string,
): CanvasSide {
	const a = layout.nodes.get(from);
	const b = layout.nodes.get(to);
	if (!a || !b) return 'right';

	const dx = (b.pos.x + b.width / 2) - (a.pos.x + a.width / 2);
	const dy = (b.pos.y + b.height / 2) - (a.pos.y + a.height / 2);

	if (Math.abs(dx) > Math.abs(dy)) {
		return dx > 0 ? 'right' : 'left';
	}
	return dy > 0 ? 'bottom' : 'top';
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function tierColor(tier: MemoryTier, colors: ColorScheme): string {
	return colors.tierColors[tier] ?? '0';
}

function edgeColor(edgeType: EdgeType, colors: ColorScheme): string {
	return colors.edgeColors[edgeType] ?? '0';
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Deterministic node ID from file path. */
function makeNodeId(filePath: string): string {
	// Simple hash-like ID: strip special chars, truncate
	return 'node-' + filePath
		.replace(/[^a-zA-Z0-9]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.substring(0, 60);
}
