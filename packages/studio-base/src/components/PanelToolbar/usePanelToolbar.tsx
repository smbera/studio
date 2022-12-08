// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useMemo, useState } from "react";

import { ToolbarConfig } from "@foxglove/studio";
import { icons } from "@foxglove/studio-base/components/SettingsTreeEditor/icons";
import Stack from "@foxglove/studio-base/components/Stack";

import ToolbarIconButton from "./ToolbarIconButton";

export default function usePanelToolbar(): [
  title: string | undefined,
  toolbarItems: React.ReactElement,
  setConfig: (config: ToolbarConfig) => void,
] {
  const [config, setConfig] = useState<ToolbarConfig>({ actionHandler: () => {} });
  const title = useMemo(() => config.title, [config]);
  const toolbarItems = useMemo(() => {
    return (
      <Stack direction="row">
        {(config.items ?? []).map((item) => {
          switch (item.input) {
            case "string": {
              throw new Error('Not implemented yet: "string" case');
            }
            case "boolean": {
              throw new Error('Not implemented yet: "boolean" case');
            }
            case "button": {
              const IconComponent = icons[item.icon];
              return (
                <ToolbarIconButton
                  disabled={item.disabled}
                  onClick={() => {
                    config.actionHandler({
                      action: "perform-control-action",
                      payload: { key: item.key },
                    });
                  }}
                  title={item.help}
                >
                  <IconComponent fontSize="small" />
                </ToolbarIconButton>
              );
            }
            case "select": {
              throw new Error('Not implemented yet: "select" case');
            }
            case "messagepath": {
              throw new Error('Not implemented yet: "messagepath" case');
            }
            case "autocomplete": {
              throw new Error('Not implemented yet: "autocomplete" case');
            }
          }
        })}
      </Stack>
    );
  }, [config]);

  return [title, toolbarItems, setConfig];
}
