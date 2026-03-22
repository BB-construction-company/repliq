const BridgeState = {
  dismissed: new Set(),
  activeTrigger: null,

  isDismissed(id) {
    return this.dismissed.has(id);
  },

  dismiss(id) {
    this.dismissed.add(id);
    this.activeTrigger = null;
  },

  accept(id) {
    this.dismissed.add(id);
    this.activeTrigger = null;
  },

  activate(id, analysisData) {
    if (this.isDismissed(id)) return;
    this.activeTrigger = id;
    console.log("=== BRIDGE ACTIVATED ===", id, analysisData);
  },
};
