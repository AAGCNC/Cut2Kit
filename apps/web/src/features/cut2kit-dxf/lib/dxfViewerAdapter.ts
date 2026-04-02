import type { ProjectReadFileResult } from "@t3tools/contracts";
import { DxfViewer } from "dxf-viewer";
import * as THREE from "three";

import type { DxfViewportBounds, DxfViewportView } from "../state/dxfViewportStore";

const VIEW_PADDING = 0.08;
const ZOOM_FACTOR = 1.2;

function createDxfWorker() {
  return new Worker(new URL("../workers/dxfViewer.worker.ts", import.meta.url), {
    type: "module",
  });
}

function toViewportView(viewer: DxfViewer): DxfViewportView {
  const camera = viewer.GetCamera();
  return {
    centerX: camera.position.x,
    centerY: camera.position.y,
    width: (camera.right - camera.left) / camera.zoom,
  };
}

function toSceneBounds(viewer: DxfViewer): DxfViewportBounds | null {
  const bounds = viewer.GetBounds();
  if (!bounds) {
    return null;
  }
  const origin = viewer.GetOrigin();
  return {
    minX: bounds.minX - origin.x,
    minY: bounds.minY - origin.y,
    maxX: bounds.maxX - origin.x,
    maxY: bounds.maxY - origin.y,
  };
}

export type DxfViewerLoadResult = {
  bounds: DxfViewportBounds | null;
  view: DxfViewportView | null;
  homeView: DxfViewportView | null;
  warnings: ReadonlyArray<string>;
};

export class DxfViewerAdapter {
  private readonly viewer: DxfViewer;
  private readonly warningMessages = new Set<string>();
  private readonly handleMessage: (event: Event) => void;
  private readonly handleViewChanged: () => void;
  private homeView: DxfViewportView | null = null;

  constructor(
    container: HTMLElement,
    callbacks: {
      onViewChange: (view: DxfViewportView | null) => void;
    },
  ) {
    this.viewer = new DxfViewer(container, {
      autoResize: true,
      antialias: true,
      clearAlpha: 1,
      clearColor: new THREE.Color("#0d131b"),
      colorCorrection: true,
      preserveDrawingBuffer: false,
      sceneOptions: {
        suppressPaperSpace: true,
      },
    });

    if (!this.viewer.HasRenderer()) {
      throw new Error("WebGL is unavailable in this browser environment.");
    }

    this.handleMessage = (event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      const message = detail?.message?.trim();
      if (message) {
        this.warningMessages.add(message);
      }
    };
    this.handleViewChanged = () => {
      callbacks.onViewChange(this.hasScene() ? toViewportView(this.viewer) : null);
    };

    this.viewer.Subscribe("message", this.handleMessage);
    this.viewer.Subscribe("viewChanged", this.handleViewChanged);
  }

  async load(document: Pick<ProjectReadFileResult, "contents">): Promise<DxfViewerLoadResult> {
    this.warningMessages.clear();
    this.homeView = null;

    const blobUrl = URL.createObjectURL(
      new Blob([document.contents], {
        type: "application/dxf",
      }),
    );

    try {
      await this.loadFromUrl(blobUrl, true);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

    this.installOverlayGroups();

    const view = this.hasScene() ? toViewportView(this.viewer) : null;
    this.homeView = view;

    return {
      bounds: toSceneBounds(this.viewer),
      view,
      homeView: view,
      warnings: [...this.warningMessages],
    };
  }

  fitToView() {
    const bounds = toSceneBounds(this.viewer);
    if (!bounds) {
      return;
    }
    this.viewer.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, VIEW_PADDING);
    this.viewer.Render();
  }

  resetView() {
    if (!this.homeView) {
      this.fitToView();
      return;
    }
    this.viewer.SetView(
      new THREE.Vector3(this.homeView.centerX, this.homeView.centerY, 1),
      this.homeView.width,
    );
    this.viewer.Render();
  }

  zoomIn() {
    this.zoomBy(1 / ZOOM_FACTOR);
  }

  zoomOut() {
    this.zoomBy(ZOOM_FACTOR);
  }

  clear() {
    this.warningMessages.clear();
    this.homeView = null;
    this.viewer.Clear();
  }

  destroy() {
    this.viewer.Unsubscribe("message", this.handleMessage);
    this.viewer.Unsubscribe("viewChanged", this.handleViewChanged);
    this.viewer.Destroy();
  }

  private async loadFromUrl(url: string, tryWorker: boolean): Promise<void> {
    try {
      await this.viewer.Load({
        url,
        workerFactory: tryWorker ? createDxfWorker : null,
      });
    } catch (error) {
      if (!tryWorker) {
        throw error;
      }
      await this.viewer.Load({
        url,
        workerFactory: null,
      });
    }
  }

  private hasScene() {
    return this.viewer.GetBounds() !== null;
  }

  private installOverlayGroups() {
    const scene = this.viewer.GetScene();
    const origin = this.viewer.GetOrigin();
    const existingOverlayRoot = scene.getObjectByName("cut2kit-overlay-root");
    if (existingOverlayRoot) {
      scene.remove(existingOverlayRoot);
    }

    const overlayRoot = new THREE.Group();
    overlayRoot.name = "cut2kit-overlay-root";
    overlayRoot.position.set(-origin.x, -origin.y, 0);

    const framingOverlay = new THREE.Group();
    framingOverlay.name = "cut2kit-overlay-framing";
    const panelOverlay = new THREE.Group();
    panelOverlay.name = "cut2kit-overlay-panels";
    const annotationOverlay = new THREE.Group();
    annotationOverlay.name = "cut2kit-overlay-annotations";

    overlayRoot.add(framingOverlay);
    overlayRoot.add(panelOverlay);
    overlayRoot.add(annotationOverlay);
    scene.add(overlayRoot);
  }

  private zoomBy(widthFactor: number) {
    const view = toViewportView(this.viewer);
    this.viewer.SetView(
      new THREE.Vector3(view.centerX, view.centerY, 1),
      Math.max(view.width * widthFactor, Number.EPSILON),
    );
    this.viewer.Render();
  }
}
