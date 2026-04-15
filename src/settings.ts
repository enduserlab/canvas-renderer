/**
 * Settings tab for Canvas Knowledge Graph Renderer.
 *
 * Sections:
 *   - Paths: graph.json location, canvas output location
 *   - Layout: algorithm, spacing, force params, grouping
 *   - Appearance: node mode, colors, what to show
 *   - Filters: tier/entity/confidence filters
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type CanvasKnowledgeGraphPlugin from './main';
import {
	CanvasRendererSettings,
	DEFAULT_LAYOUT,
	DEFAULT_COLORS,
	DEFAULT_RENDER,
	LayoutAlgorithm,
	MemoryTier,
	NodeRenderMode,
} from './types';

export class CanvasRendererSettingTab extends PluginSettingTab {
	plugin: CanvasKnowledgeGraphPlugin;

	constructor(app: App, plugin: CanvasKnowledgeGraphPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// -----------------------------------------------------------------
		// Paths
		// -----------------------------------------------------------------

		new Setting(containerEl).setName('Paths').setHeading();

		new Setting(containerEl)
			.setName('Graph data file')
			.setDesc('Vault-relative path to the graph.json file produced by the wiki plugin.')
			.addText(text => text
				.setPlaceholder('Example: _schema/graph.json')
				.setValue(this.plugin.settings.graphPath)
				.onChange(async (value) => {
					this.plugin.settings.graphPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Canvas output folder')
			.setDesc('Where generated canvas files are written (empty for vault root).')
			.addText(text => text
				.setPlaceholder('Example: wiki/canvases')
				.setValue(this.plugin.settings.outputPath)
				.onChange(async (value) => {
					this.plugin.settings.outputPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Canvas filename')
			.setDesc('Default filename for the generated canvas.')
			.addText(text => text
				.setPlaceholder('Example: knowledge-graph.canvas')
				.setValue(this.plugin.settings.canvasFilename)
				.onChange(async (value) => {
					this.plugin.settings.canvasFilename = value;
					await this.plugin.saveSettings();
				}));

		// -----------------------------------------------------------------
		// Layout
		// -----------------------------------------------------------------

		new Setting(containerEl).setName('Layout').setHeading();

		new Setting(containerEl)
			.setName('Algorithm')
			.setDesc('How nodes are positioned on the canvas.')
			.addDropdown(dd => dd
				.addOption('force-directed', 'Force-directed (organic)')
				.addOption('radial', 'Radial (tier rings)')
				.addOption('grid', 'Grid (by entity type)')
				.setValue(this.plugin.settings.layout.algorithm)
				.onChange(async (value) => {
					this.plugin.settings.layout.algorithm = value as LayoutAlgorithm;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Node width')
			.setDesc('Base width of canvas cards in pixels.')
			.addText(text => text
				.setValue(String(this.plugin.settings.layout.nodeWidth))
				.onChange(async (value) => {
					const n = parseInt(value, 10);
					if (!isNaN(n) && n > 0) {
						this.plugin.settings.layout.nodeWidth = n;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Node height')
			.setDesc('Base height of canvas cards in pixels.')
			.addText(text => text
				.setValue(String(this.plugin.settings.layout.nodeHeight))
				.onChange(async (value) => {
					const n = parseInt(value, 10);
					if (!isNaN(n) && n > 0) {
						this.plugin.settings.layout.nodeHeight = n;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Spacing multiplier')
			.setDesc('Higher values spread nodes further apart.')
			.addText(text => text
				.setValue(String(this.plugin.settings.layout.spacing))
				.onChange(async (value) => {
					const n = parseFloat(value);
					if (!isNaN(n) && n > 0) {
						this.plugin.settings.layout.spacing = n;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Force iterations')
			.setDesc('Higher values produce a better layout at the cost of render time (force-directed only).')
			.addText(text => text
				.setValue(String(this.plugin.settings.layout.iterations))
				.onChange(async (value) => {
					const n = parseInt(value, 10);
					if (!isNaN(n) && n > 0) {
						this.plugin.settings.layout.iterations = n;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Spring length')
			.setDesc('Ideal distance between connected nodes.')
			.addText(text => text
				.setValue(String(this.plugin.settings.layout.springLength))
				.onChange(async (value) => {
					const n = parseInt(value, 10);
					if (!isNaN(n) && n > 0) {
						this.plugin.settings.layout.springLength = n;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Repulsion')
			.setDesc('Strength of push between unconnected nodes.')
			.addText(text => text
				.setValue(String(this.plugin.settings.layout.repulsion))
				.onChange(async (value) => {
					const n = parseInt(value, 10);
					if (!isNaN(n) && n > 0) {
						this.plugin.settings.layout.repulsion = n;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Scale by connections')
			.setDesc('Make heavily-connected nodes larger.')
			.addToggle(t => t
				.setValue(this.plugin.settings.layout.sizeByDegree)
				.onChange(async (value) => {
					this.plugin.settings.layout.sizeByDegree = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Group by community')
			.setDesc('Cluster nodes that share a community ID together.')
			.addToggle(t => t
				.setValue(this.plugin.settings.layout.groupByCommunity)
				.onChange(async (value) => {
					this.plugin.settings.layout.groupByCommunity = value;
					await this.plugin.saveSettings();
				}));

		// -----------------------------------------------------------------
		// Appearance
		// -----------------------------------------------------------------

		new Setting(containerEl).setName('Appearance').setHeading();

		new Setting(containerEl)
			.setName('Node style')
			.setDesc('Use live file embeds or summary text cards for each node.')
			.addDropdown(dd => dd
				.addOption('file', 'File embed (live preview)')
				.addOption('text', 'Text card (summary)')
				.setValue(this.plugin.settings.render.nodeMode)
				.onChange(async (value) => {
					this.plugin.settings.render.nodeMode = value as NodeRenderMode;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show edge labels')
			.setDesc('Display relationship labels on arrows.')
			.addToggle(t => t
				.setValue(this.plugin.settings.render.showEdgeLabels)
				.onChange(async (value) => {
					this.plugin.settings.render.showEdgeLabels = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show confidence')
			.setDesc('Display confidence score in text cards.')
			.addToggle(t => t
				.setValue(this.plugin.settings.render.showConfidence)
				.onChange(async (value) => {
					this.plugin.settings.render.showConfidence = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show tier')
			.setDesc('Display memory tier badge in text cards.')
			.addToggle(t => t
				.setValue(this.plugin.settings.render.showTier)
				.onChange(async (value) => {
					this.plugin.settings.render.showTier = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show community groups')
			.setDesc('Draw colored group boxes around node clusters.')
			.addToggle(t => t
				.setValue(this.plugin.settings.render.showCommunityGroups)
				.onChange(async (value) => {
					this.plugin.settings.render.showCommunityGroups = value;
					await this.plugin.saveSettings();
				}));

		// -----------------------------------------------------------------
		// Filters
		// -----------------------------------------------------------------

		new Setting(containerEl).setName('Filters').setHeading();

		new Setting(containerEl)
			.setName('Minimum confidence')
			.setDesc('Only show nodes above this confidence threshold (0–1).')
			.addText(text => text
				.setValue(String(this.plugin.settings.render.minConfidence))
				.onChange(async (value) => {
					const n = parseFloat(value);
					if (!isNaN(n) && n >= 0 && n <= 1) {
						this.plugin.settings.render.minConfidence = n;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Filter tiers')
			.setDesc('Comma-separated tiers to include (working, episodic, semantic, procedural). Blank means all.')
			.addText(text => text
				.setValue(this.plugin.settings.render.filterTiers.join(', '))
				.onChange(async (value) => {
					const tiers = value
						.split(',')
						.map(s => s.trim())
						.filter(s => ['working', 'episodic', 'semantic', 'procedural'].includes(s)) as MemoryTier[];
					this.plugin.settings.render.filterTiers = tiers;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Filter entity types')
			.setDesc('Comma-separated entity types to include (e.g. person, concept, project). Blank means all.')
			.addText(text => text
				.setValue(this.plugin.settings.render.filterEntityTypes.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.render.filterEntityTypes = value
						.split(',')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					await this.plugin.saveSettings();
				}));

		// -----------------------------------------------------------------
		// Reset
		// -----------------------------------------------------------------

		new Setting(containerEl).setName('Reset').setHeading();

		new Setting(containerEl)
			.setName('Reset layout to defaults')
			.setDesc('Restore all layout settings to their defaults.')
			.addButton(btn => btn
				.setButtonText('Reset layout')
				.onClick(async () => {
					this.plugin.settings.layout = { ...DEFAULT_LAYOUT };
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName('Reset colors to defaults')
			.setDesc('Restore all color settings to their defaults.')
			.addButton(btn => btn
				.setButtonText('Reset colors')
				.onClick(async () => {
					this.plugin.settings.colors = {
						tierColors: { ...DEFAULT_COLORS.tierColors },
						edgeColors: { ...DEFAULT_COLORS.edgeColors },
					};
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName('Reset render options to defaults')
			.setDesc('Restore all appearance and filter settings to their defaults.')
			.addButton(btn => btn
				.setButtonText('Reset render')
				.onClick(async () => {
					this.plugin.settings.render = { ...DEFAULT_RENDER };
					await this.plugin.saveSettings();
					this.display();
				}));
	}
}
