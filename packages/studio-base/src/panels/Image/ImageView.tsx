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

import { Typography, styled as muiStyled } from "@mui/material";
import produce from "immer";
import { difference, set, union } from "lodash";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { useUpdateEffect } from "react-use";
import { DeepPartial } from "ts-essentials";

import { PanelExtensionContext, SettingsTreeAction, Topic } from "@foxglove/studio";
import {
  PanelContextMenu,
  PanelContextMenuItem,
} from "@foxglove/studio-base/components/PanelContextMenu";
import PanelToolbar from "@foxglove/studio-base/components/PanelToolbar";
import Stack from "@foxglove/studio-base/components/Stack";
import inScreenshotTests from "@foxglove/studio-base/stories/inScreenshotTests";
import { CameraInfo } from "@foxglove/studio-base/types/Messages";
import { mightActuallyBePartial } from "@foxglove/studio-base/util/mightActuallyBePartial";
import { getTopicsByTopicName } from "@foxglove/studio-base/util/selectors";
import { fonts } from "@foxglove/studio-base/util/sharedStyleConstants";
import { formatTimeRaw } from "@foxglove/studio-base/util/time";

import { ImageCanvas, ImageEmptyState, Toolbar, TopicDropdown } from "./components";
import { useCameraInfo, ANNOTATION_DATATYPES, useImagePanelMessages } from "./hooks";
import helpContent from "./index.help.md";
import { downloadImage } from "./lib/downloadImage";
import { NORMALIZABLE_IMAGE_DATATYPES } from "./lib/normalizeMessage";
import { getRelatedMarkerTopics, getMarkerOptions } from "./lib/util";
import { buildSettingsTree } from "./settings";
import type { Config, PixelData } from "./types";

type Props = {
  context: PanelExtensionContext;
};

const Timestamp = muiStyled(Typography, {
  shouldForwardProp: (prop) => prop !== "screenshotTest",
})<{ screenshotTest: boolean }>(({ screenshotTest, theme }) => ({
  position: "absolute",
  margin: theme.spacing(0.5),
  right: 0,
  bottom: 0,
  zIndex: theme.zIndex.appBar - 1,
  transition: "opacity 0.1s ease-in-out",
  opacity: 0,
  padding: theme.spacing(0.25, 0.5),
  userSelect: "all",

  ".mosaic-window:hover &": {
    opacity: "1",
  },
  ...(screenshotTest && {
    opacity: 1,
  }),
}));

export function ImageView({ context }: Props): JSX.Element {
  const [renderDone, setRenderDone] = useState(() => () => {});
  const [topics, setTopics] = useState<readonly Topic[]>([]);
  const [config, setConfig] = useState<Config>(() => {
    const initialConfig = context.initialState as DeepPartial<Config>;
    return {
      ...defaultConfig,
      ...initialConfig,
      pan: {
        x: initialConfig.pan?.x ?? 0,
        y: initialConfig.pan?.y ?? 0,
      },
    };
  });
  const { cameraTopic, enabledMarkerTopics, transformMarkers } = config;
  const cameraTopicFullObject = useMemo(
    () => getTopicsByTopicName(topics)[cameraTopic],
    [cameraTopic, topics],
  );
  const [activePixelData, setActivePixelData] = useState<PixelData | undefined>();

  const cameraInfo = useCameraInfo(cameraTopic);

  const shouldSynchronize = config.synchronize && enabledMarkerTopics.length > 0;

  const subscriptions = useMemo(
    () => [cameraTopic, ...enabledMarkerTopics],
    [cameraTopic, enabledMarkerTopics],
  );
  useEffect(() => {
    context.subscribe(subscriptions);
  }, [context, subscriptions]);

  const store = useImagePanelMessages({
    imageTopic: cameraTopic,
    annotationTopics: enabledMarkerTopics,
    synchronize: shouldSynchronize,
  });

  useEffect(() => {
    context.onRender = (renderState, done) => {
      ReactDOM.unstable_batchedUpdates(() => {
        if (renderState.topics) {
          setTopics(renderState.topics);
        }
        setRenderDone(() => done);
        if (renderState.didSeek ?? false) {
          store.clear();
        }
        if (renderState.currentFrame) {
          store.setCurrentFrame(renderState.currentFrame);
        }
      });
    };
  }, [context, store]);

  useEffect(() => {
    context.subscribe([cameraTopic]);
  }, [context, cameraTopic]);

  // Indicate render is complete - the effect runs after the dom is updated
  useEffect(() => {
    renderDone();
  }, [renderDone]);

  const imageTopics = useMemo(() => {
    return topics.filter(({ schemaName }) => NORMALIZABLE_IMAGE_DATATYPES.includes(schemaName));
  }, [topics]);

  // If no cameraTopic is selected, automatically select the first available image topic
  useEffect(() => {
    const maybeCameraTopic = mightActuallyBePartial(config).cameraTopic;
    if (maybeCameraTopic == undefined || maybeCameraTopic === "") {
      const firstImageTopic = imageTopics[0];
      if (firstImageTopic && firstImageTopic.name !== "") {
        setConfig((oldConfig) => ({ ...oldConfig, cameraTopic: firstImageTopic.name }));
      }
    }
  }, [imageTopics, config]);

  const onChangeCameraTopic = useCallback(
    (newCameraTopic: string) => {
      const newAvailableMarkerTopics = getMarkerOptions(
        newCameraTopic,
        topics,
        ANNOTATION_DATATYPES,
      );

      const newEnabledMarkerTopics = getRelatedMarkerTopics(
        enabledMarkerTopics,
        newAvailableMarkerTopics,
      );

      setConfig((oldConfig) => ({
        ...oldConfig,
        cameraTopic: newCameraTopic,
        enabledMarkerTopics: newEnabledMarkerTopics,
      }));
    },
    [enabledMarkerTopics, topics],
  );

  const relatedMarkerTopics = useMemo(
    () => getMarkerOptions(config.cameraTopic, topics, ANNOTATION_DATATYPES),
    [config.cameraTopic, topics],
  );

  const actionHandler = useCallback(
    (action: SettingsTreeAction) => {
      if (action.action !== "update") {
        return;
      }

      const { path, value } = action.payload;
      setConfig(
        produce<Config>((draft) => {
          if (path[0] === "markers") {
            const markerTopic = path[1] ?? "unknown";
            const newValue =
              value === true
                ? union(draft.enabledMarkerTopics, [markerTopic])
                : difference(draft.enabledMarkerTopics, [markerTopic]);
            draft.enabledMarkerTopics = newValue;
          } else {
            set(draft, path.slice(1), value);
          }
        }),
      );

      if (path[1] === "cameraTopic" && typeof value === "string") {
        onChangeCameraTopic(value);
      }
    },
    [onChangeCameraTopic],
  );

  const markerTopics = useMemo(() => {
    return topics
      .filter((topic) => (ANNOTATION_DATATYPES as readonly string[]).includes(topic.schemaName))
      .map((topic) => topic.name);
  }, [topics]);

  useEffect(() => {
    context.updatePanelSettingsEditor({
      actionHandler,
      nodes: buildSettingsTree({
        config,
        imageTopics,
        markerTopics,
        enabledMarkerTopics,
        relatedMarkerTopics,
      }),
    });
  }, [
    actionHandler,
    config,
    enabledMarkerTopics,
    imageTopics,
    markerTopics,
    relatedMarkerTopics,
    context,
  ]);

  const lastImageMessageRef = useRef(image);

  useEffect(() => {
    if (image) {
      lastImageMessageRef.current = image;
    }
  }, [image]);

  // Keep the last image message, if it exists, to render on the ImageCanvas.
  // Improve perf by hiding the ImageCanvas while seeking, instead of unmounting and remounting it.
  const imageMessageToRender = image ?? lastImageMessageRef.current;

  // Clear our cached last image when the camera topic changes since it came from the old topic.
  useUpdateEffect(() => {
    lastImageMessageRef.current = undefined;
  }, [cameraTopic]);

  const doDownloadImage = useCallback(async () => {
    if (!imageMessageToRender) {
      return;
    }

    const topic = imageTopics.find((top) => top.name === cameraTopic);
    if (!topic) {
      return;
    }

    await downloadImage(imageMessageToRender, topic, config);
  }, [imageTopics, cameraTopic, config, imageMessageToRender]);

  const contextMenuItemsForClickPosition = useCallback<() => PanelContextMenuItem[]>(
    () => [
      { type: "item", label: "Download image", onclick: doDownloadImage },
      { type: "divider" },
      {
        type: "item",
        label: "Flip horizontal",
        onclick: () =>
          setConfig((oldConfig) => ({
            ...oldConfig,
            flipHorizontal: !(oldConfig.flipHorizontal ?? false),
          })),
      },
      {
        type: "item",
        label: "Flip vertical",
        onclick: () =>
          setConfig((oldConfig) => ({
            ...oldConfig,
            flipVertical: !(oldConfig.flipVertical ?? false),
          })),
      },
      {
        type: "item",
        label: "Rotate 90°",
        onclick: () =>
          setConfig((oldConfig) => ({
            ...oldConfig,
            rotation: ((oldConfig.rotation ?? 0) + 90) % 360,
          })),
      },
    ],
    [doDownloadImage],
  );

  const onStartRenderImage = useCallback(() => {
    return renderDone;
  }, [renderDone]);

  const rawMarkerData = useMemo(() => {
    return {
      markers: annotations ?? [],
      transformMarkers,
      // Convert to plain object before sending to web worker
      cameraInfo:
        (cameraInfo as { toJSON?: () => CameraInfo } | undefined)?.toJSON?.() ?? cameraInfo,
    };
  }, [annotations, cameraInfo, transformMarkers]);

  return (
    <Stack flex="auto" overflow="hidden" position="relative">
      <PanelToolbar helpContent={helpContent}>
        <Stack direction="row" flex="auto" alignItems="center" overflow="hidden">
          <TopicDropdown
            topics={imageTopics}
            currentTopic={cameraTopic}
            onChange={(value) => setConfig((oldConfig) => ({ ...oldConfig, cameraTopic: value }))}
          />
        </Stack>
      </PanelToolbar>
      <PanelContextMenu itemsForClickPosition={contextMenuItemsForClickPosition} />
      <Stack fullWidth fullHeight>
        {/* Always render the ImageCanvas because it's expensive to unmount and start up. */}
        {imageMessageToRender && (
          <ImageCanvas
            topic={cameraTopicFullObject}
            image={imageMessageToRender}
            rawMarkerData={rawMarkerData}
            config={config}
            saveConfig={(newConfig) => setConfig((oldConfig) => ({ ...oldConfig, ...newConfig }))}
            onStartRenderImage={onStartRenderImage}
            setActivePixelData={setActivePixelData}
          />
        )}
        {/* If rendered, EmptyState will hide the always-present ImageCanvas */}
        {!image && (
          <ImageEmptyState
            cameraTopic={cameraTopic}
            markerTopics={enabledMarkerTopics}
            shouldSynchronize={shouldSynchronize}
          />
        )}
        {image && (
          <Timestamp
            fontFamily={fonts.MONOSPACE}
            variant="caption"
            align="right"
            screenshotTest={inScreenshotTests()}
          >
            {formatTimeRaw(image.stamp)}
          </Timestamp>
        )}
      </Stack>
      <Toolbar pixelData={activePixelData} />
    </Stack>
  );
}

export const defaultConfig: Config = {
  cameraTopic: "",
  enabledMarkerTopics: [],
  mode: "fit",
  pan: { x: 0, y: 0 },
  rotation: 0,
  synchronize: false,
  transformMarkers: false,
  zoom: 1,
};
