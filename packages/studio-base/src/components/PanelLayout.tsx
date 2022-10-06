// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import { Button, CircularProgress, styled as muiStyled } from "@mui/material";
import moment from "moment";
import React, {
  LazyExoticComponent,
  PropsWithChildren,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useDrop } from "react-dnd";
import {
  MosaicDragType,
  MosaicNode,
  MosaicPath,
  MosaicWindow,
  MosaicWithoutDragDropContext,
} from "react-mosaic-component";

import { EmptyPanelLayout } from "@foxglove/studio-base/components/EmptyPanelLayout";
import EmptyState from "@foxglove/studio-base/components/EmptyState";
import { useLayoutBrowserReducer } from "@foxglove/studio-base/components/LayoutBrowser/reducer";
import PanelToolbar from "@foxglove/studio-base/components/PanelToolbar";
import Stack from "@foxglove/studio-base/components/Stack";
import {
  LayoutState,
  useCurrentLayoutSelector,
  usePanelMosaicId,
} from "@foxglove/studio-base/context/CurrentLayoutContext";
import { useCurrentLayoutActions } from "@foxglove/studio-base/context/CurrentLayoutContext";
import { PanelsState } from "@foxglove/studio-base/context/CurrentLayoutContext/actions";
import "react-mosaic-component/react-mosaic-component.css";
import { useExtensionCatalog } from "@foxglove/studio-base/context/ExtensionCatalogContext";
import { useLayoutManager } from "@foxglove/studio-base/context/LayoutManagerContext";
import { PanelComponent, usePanelCatalog } from "@foxglove/studio-base/context/PanelCatalogContext";
import { useWorkspace } from "@foxglove/studio-base/context/WorkspaceContext";
import { defaultPlaybackConfig } from "@foxglove/studio-base/providers/CurrentLayoutProvider/reducers";
import { MosaicDropResult, PanelConfig } from "@foxglove/studio-base/types/panels";
import { getPanelIdForType, getPanelTypeFromId } from "@foxglove/studio-base/util/layout";

import ErrorBoundary from "./ErrorBoundary";
import { MosaicPathContext } from "./MosaicPathContext";
import { PanelRemounter } from "./PanelRemounter";

type Props = {
  layout?: MosaicNode<string>;
  onChange: (panels: MosaicNode<string> | undefined) => void;
  tabId?: string;
};

// CSS hack to disable the first level of drop targets inside a Tab's own mosaic window (that would
// place the dropped item as a sibling of the Tab), as well as the "root drop targets" inside the
// nested mosaic (that would place the dropped item as a direct child of the Tab). Makes it easier
// to drop panels into a tab layout.
const HideTopLevelDropTargets = muiStyled("div")`
  margin: 0;

  .mosaic-root + .drop-target-container {
    display: none !important;
  }
  & > .mosaic-window > .drop-target-container {
    display: none !important;
  }
`;

// This wrapper makes the tabId available in the drop result when something is dropped into a nested
// drop target. This allows a panel to know which mosaic it was dropped in regardless of nesting
// level.
function TabMosaicWrapper({ tabId, children }: PropsWithChildren<{ tabId?: string }>) {
  const [, drop] = useDrop<unknown, MosaicDropResult, never>({
    accept: MosaicDragType.WINDOW,
    drop: (_item, monitor) => {
      const nestedDropResult = monitor.getDropResult<MosaicDropResult>();
      if (nestedDropResult) {
        // The drop result may already have a tabId if it was dropped in a more deeply-nested Tab
        // mosaic. Provide our tabId only if there wasn't one already.
        return { tabId, ...nestedDropResult };
      }
      return undefined;
    },
  });
  return (
    <HideTopLevelDropTargets className="mosaic-tile" ref={drop}>
      {children}
    </HideTopLevelDropTargets>
  );
}

export function UnconnectedPanelLayout(props: Props): React.ReactElement {
  const { savePanelConfigs } = useCurrentLayoutActions();
  const mosaicId = usePanelMosaicId();
  const { layout, onChange, tabId } = props;
  const createTile = useCallback(
    (config?: { type?: string; panelConfig?: PanelConfig }) => {
      const defaultPanelType = "RosOut";
      const type = config?.type ? config.type : defaultPanelType;
      const id = getPanelIdForType(type);
      if (config?.panelConfig) {
        savePanelConfigs({ configs: [{ id, config: config.panelConfig }] });
      }
      return id;
    },
    [savePanelConfigs],
  );

  const panelCatalog = usePanelCatalog();

  const panelComponentCache = useRef(
    new Map<string, LazyExoticComponent<PanelComponent> | (() => JSX.Element)>(),
  );

  // Clear panel cache when panel catalog changes.
  useEffect(() => {
    panelComponentCache.current.clear();
  }, [panelCatalog]);

  const renderTile = useCallback(
    (id: string | Record<string, never> | undefined, path: MosaicPath) => {
      // `id` is usually a string. But when `layout` is empty, `id` will be an empty object, in which case we don't need to render Tile
      if (id == undefined || typeof id !== "string") {
        return <></>;
      }
      const type = getPanelTypeFromId(id);

      let Panel = panelComponentCache.current.get(type);

      // cache the lazy created panel component to avoid making the component again
      if (!Panel) {
        const panelInfo = panelCatalog.getPanelByType(type);
        // If we haven't found a panel of the given type, render the panel selector
        Panel = panelInfo
          ? React.lazy(panelInfo.module)
          : () => (
              <Stack flex="auto" alignItems="center" justifyContent="center" data-testid={id}>
                <PanelToolbar isUnknownPanel />
                <EmptyState>Unknown panel type: {type}.</EmptyState>
              </Stack>
            );

        if (panelInfo) {
          panelComponentCache.current.set(type, Panel);
        }
      }

      const mosaicWindow = (
        <MosaicWindow
          title=""
          key={id}
          path={path}
          createNode={createTile}
          renderPreview={() => undefined as unknown as JSX.Element}
        >
          <Suspense
            fallback={
              <EmptyState>
                <CircularProgress size={28} />
              </EmptyState>
            }
          >
            <MosaicPathContext.Provider value={path}>
              <PanelRemounter id={id} tabId={tabId}>
                <Panel childId={id} tabId={tabId} />
              </PanelRemounter>
            </MosaicPathContext.Provider>
          </Suspense>
        </MosaicWindow>
      );
      if (type === "Tab") {
        return <TabMosaicWrapper tabId={id}>{mosaicWindow}</TabMosaicWrapper>;
      }
      return mosaicWindow;
    },
    [createTile, tabId, panelCatalog],
  );

  const bodyToRender = useMemo(
    () =>
      layout != undefined ? (
        <MosaicWithoutDragDropContext
          renderTile={renderTile}
          className="mosaic-foxglove-theme" // prevent the default mosaic theme from being applied
          resize={{ minimumPaneSizePercentage: 2 }}
          value={layout}
          onChange={(newLayout) => onChange(newLayout ?? undefined)}
          mosaicId={mosaicId}
        />
      ) : (
        <EmptyPanelLayout tabId={tabId} />
      ),
    [layout, mosaicId, onChange, renderTile, tabId],
  );

  return <ErrorBoundary>{bodyToRender}</ErrorBoundary>;
}

function LoadingState(): JSX.Element {
  return (
    <EmptyState>
      <CircularProgress size={28} />
    </EmptyState>
  );
}

const selectedLayoutLoadingSelector = (state: LayoutState) => state.selectedLayout?.loading;
const selectedLayoutExistsSelector = (state: LayoutState) =>
  state.selectedLayout?.data != undefined;
const selectedLayoutMosaicSelector = (state: LayoutState) => state.selectedLayout?.data?.layout;

export default function PanelLayout(): JSX.Element {
  const { changePanelLayout, setSelectedLayoutId } = useCurrentLayoutActions();
  const { openLayoutBrowser } = useWorkspace();
  const layoutManager = useLayoutManager();
  const layoutExists = useCurrentLayoutSelector(selectedLayoutExistsSelector);
  const layoutLoading = useCurrentLayoutSelector(selectedLayoutLoadingSelector);
  const mosaicLayout = useCurrentLayoutSelector(selectedLayoutMosaicSelector);
  const registeredExtensions = useExtensionCatalog((state) => state.installedExtensions);

  const currentDateForStorybook = useMemo(() => new Date("2021-06-16T04:28:33.549Z"), []);
  const selectedLayoutIdSelector = (state: LayoutState) => state.selectedLayout?.id;
  const currentLayoutId = useCurrentLayoutSelector(selectedLayoutIdSelector);

  const [, dispatch] = useLayoutBrowserReducer({
    busy: layoutManager.isBusy,
    error: layoutManager.error,
    online: layoutManager.isOnline,
  });

  const createNewLayout = async () => {
    openLayoutBrowser();
    const panelState: Omit<PanelsState, "name" | "id"> = {
      configById: {},
      globalVariables: {},
      userNodes: {},
      linkedGlobalVariables: [],
      playbackConfig: defaultPlaybackConfig,
    };
    const name = `Unnamed layout ${moment(currentDateForStorybook).format("l")} at ${moment(
      currentDateForStorybook,
    ).format("LT")}`;
    const newLayout = await layoutManager.saveNewLayout({
      name,
      data: panelState as PanelsState,
      permission: "CREATOR_WRITE",
    });

    if (newLayout.id !== currentLayoutId) {
      setSelectedLayoutId(newLayout.id);
      dispatch({ type: "select-id", id: newLayout.id });
    }
  };

  const onChange = useCallback(
    (newLayout: MosaicNode<string> | undefined) => {
      if (newLayout != undefined) {
        changePanelLayout({ layout: newLayout });
      }
    },
    [changePanelLayout],
  );

  if (registeredExtensions == undefined) {
    return <LoadingState />;
  }

  if (layoutExists) {
    return <UnconnectedPanelLayout layout={mosaicLayout} onChange={onChange} />;
  }

  if (layoutLoading === true) {
    return <LoadingState />;
  }

  return (
    <EmptyState>
      <Button variant="contained" size="large" onClick={createNewLayout}>
        Create new layout
      </Button>
    </EmptyState>
  );
}
