// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { MenuItem, Select } from "@mui/material";
import { useMemo, useState } from "react";
import { makeStyles } from "tss-react/mui";
import { v4 as uuid } from "uuid";

import { ToolbarConfig } from "@foxglove/studio";
import MessagePathInput from "@foxglove/studio-base/components/MessagePathSyntax/MessagePathInput";
import { icons } from "@foxglove/studio-base/components/SettingsTreeEditor/icons";
import Stack from "@foxglove/studio-base/components/Stack";

import ToolbarIconButton from "./ToolbarIconButton";

// Used to support both undefined and empty string in select inputs.
const UNDEFINED_SENTINEL_VALUE = uuid();

const useStyles = makeStyles()((theme) => {
  const prefersDarkMode = theme.palette.mode === "dark";
  const inputBackgroundColor = prefersDarkMode
    ? "rgba(255, 255, 255, 0.09)"
    : "rgba(0, 0, 0, 0.06)";

  return {
    select: {
      ".MuiSelect-select.MuiInputBase-inputSizeSmall": {
        paddingBottom: theme.spacing(0.375),
        paddingTop: theme.spacing(0.375),
      },
    },
    messagePathWrapper: {
      padding: theme.spacing(0.75, 1),
      borderRadius: theme.shape.borderRadius,
      fontSize: "0.75em",
      backgroundColor: inputBackgroundColor,

      input: {
        height: "1.4375em",
      },
      "&:hover": {
        backgroundColor: prefersDarkMode ? "rgba(255, 255, 255, 0.13)" : "rgba(0, 0, 0, 0.09)",
        // Reset on touch devices, it doesn't add specificity
        "@media (hover: none)": {
          backgroundColor: inputBackgroundColor,
        },
      },
      "&:focus-within": {
        backgroundColor: inputBackgroundColor,
      },
    },
  };
});

export default function usePanelToolbar(): [
  title: string | undefined,
  toolbarItems: React.ReactElement,
  setConfig: (config: ToolbarConfig) => void,
] {
  const [config, setConfig] = useState<ToolbarConfig>({ actionHandler: () => {} });
  const title = useMemo(() => config.title, [config]);
  const { classes } = useStyles();
  const toolbarItems = useMemo(() => {
    return (
      <Stack direction="row" alignItems="center">
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
              return (
                <Select
                  className={classes.select}
                  size="small"
                  displayEmpty
                  disabled={item.disabled}
                  value={item.value ?? UNDEFINED_SENTINEL_VALUE}
                  renderValue={(value) => {
                    for (const option of item.options) {
                      if (option.value === value) {
                        return option.label.trim();
                      }
                    }
                    return undefined;
                  }}
                  onChange={(event) =>
                    config.actionHandler({
                      action: "update",
                      payload: {
                        key: item.key,
                        input: "select",
                        value:
                          event.target.value === UNDEFINED_SENTINEL_VALUE
                            ? undefined
                            : event.target.value,
                      },
                    })
                  }
                  MenuProps={{ MenuListProps: { dense: true } }}
                >
                  {item.options.map(({ label, value = UNDEFINED_SENTINEL_VALUE }) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              );
            }
            case "messagepath": {
              return (
                <Stack className={classes.messagePathWrapper} direction="row">
                  <MessagePathInput
                    path={item.value ?? ""}
                    disabled={item.disabled}
                    onChange={(value) =>
                      config.actionHandler({
                        action: "update",
                        payload: { input: "messagepath", key: item.key, value },
                      })
                    }
                    validTypes={item.validTypes}
                  />
                </Stack>
              );
            }
            case "autocomplete": {
              throw new Error('Not implemented yet: "autocomplete" case');
            }
          }
        })}
      </Stack>
    );
  }, [classes, config]);

  return [title, toolbarItems, setConfig];
}
