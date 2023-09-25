// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import HelpIcon from "@mui/icons-material/Help";
import SearchIcon from "@mui/icons-material/Search";
import { Button, Palette, TextField, Tooltip, Typography, inputBaseClasses,
  FormControl,
  Select,
  ListSubheader,
  InputAdornment,
  MenuItem, } from "@mui/material";
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { makeStyles } from "tss-react/mui";

import { promiseTimeout } from "@foxglove/den/async"
import Log from "@foxglove/log";
import { PanelExtensionContext, SettingsTreeAction } from "@foxglove/studio";
import Stack from "@foxglove/studio-base/components/Stack";
import { Config } from "@foxglove/studio-base/panels/CallService/types";
import { PlayerState, ServiceNameSchema } from "@foxglove/studio-base/players/types";
import ThemeProvider from "@foxglove/studio-base/theme/ThemeProvider";
import { fonts } from "@foxglove/studio-base/util/sharedStyleConstants";

import { defaultConfig, settingsActionReducer, useSettingsTree } from "./settings";

const log = Log.getLogger(__dirname);

type Props = {
  context: PanelExtensionContext;
};

type State = {
  status: "requesting" | "error" | "success";
  value: string;
};

const useStyles = makeStyles<{ buttonColor?: string }>()((theme, { buttonColor }) => {
  const augmentedButtonColor = buttonColor
    ? theme.palette.augmentColor({
        color: { main: buttonColor },
      })
    : undefined;

  return {
    button: {
      backgroundColor: augmentedButtonColor?.main,
      color: augmentedButtonColor?.contrastText,

      "&:hover": {
        backgroundColor: augmentedButtonColor?.dark,
      },
    },
    textarea: {
      height: "100%",

      [`.${inputBaseClasses.root}`]: {
        backgroundColor: theme.palette.background.paper,
        height: "100%",
        overflow: "hidden",
        padding: theme.spacing(1, 0.5),
        textAlign: "left",
        width: "100%",

        [`.${inputBaseClasses.input}`]: {
          height: "100% !important",
          lineHeight: 1.4,
          fontFamily: fonts.MONOSPACE,
          overflow: "auto !important",
          resize: "none",
        },
      },
    },
  };
});

function parseInput(value: string): { error?: string; parsedObject?: unknown } {
  let parsedObject;
  let error = undefined;
  try {
    const parsedAny: unknown = JSON.parse(value);
    if (Array.isArray(parsedAny)) {
      error = "Request content must be an object, not an array";
    } else if (parsedAny == undefined) {
      error = "Request content must be an object, not null";
    } else if (typeof parsedAny !== "object") {
      error = `Request content must be an object, not ‘${typeof parsedAny}’`;
    } else {
      parsedObject = parsedAny;
    }
  } catch (e) {
    error = value.length !== 0 ? e.message : "Enter valid request content as JSON";
  }
  return { error, parsedObject };
}

const containsText = (text: string, searchText: string) =>
  text.toLowerCase().includes(searchText.toLowerCase());

const formatTitle = (requestSchema: string, responseSchema: string) => (
  <pre style={{ maxHeight: 500, overflow: "auto" }}>
    {`\n------------requestSchema------------\n${requestSchema}`}
    {`\n------------responseSchema------------\n${responseSchema}`}
  </pre>
);

// Wrapper component with ThemeProvider so useStyles in the panel receives the right theme.
export function CallService({ context }: Props): JSX.Element {
  const [colorScheme, setColorScheme] = useState<Palette["mode"]>("light");

  return (
    <ThemeProvider isDark={colorScheme === "dark"}>
      <CallServiceContent context={context} setColorScheme={setColorScheme} />
    </ThemeProvider>
  );
}

function CallServiceContent(
  props: Props & { setColorScheme: Dispatch<SetStateAction<Palette["mode"]>> },
): JSX.Element {
  const { context, setColorScheme } = props;

  // panel extensions must notify when they've completed rendering
  // onRender will setRenderDone to a done callback which we can invoke after we've rendered
  const [renderDone, setRenderDone] = useState<() => void>(() => () => {});
  const [state, setState] = useState<State | undefined>();
  const [config, setConfig] = useState<Config>(() => ({
    ...defaultConfig,
    ...(context.initialState as Partial<Config>),
  }));
  const { classes } = useStyles({ buttonColor: config.buttonColor });

  const [searchText, setSearchText] = useState("");

  const serviceNameSchema: ServiceNameSchema = useMemo(() => {
    return (context.playerState as PlayerState).activeData?.serviceNameSchema ?? new Map();
  }, [context.playerState]);

  const displayedOptions = useMemo(() => {
    const options: Array<{ serviceName: string; title: JSX.Element }> = [];

    serviceNameSchema.forEach(({ requestSchema, responseSchema }, serviceName) => {
      if (
        containsText(requestSchema, searchText) ||
        containsText(responseSchema, searchText) ||
        containsText(serviceName, searchText)
      ) {
        options.push({
          serviceName,
          title: formatTitle(requestSchema, responseSchema),
        });
      }
    });

    return options;
  }, [searchText, serviceNameSchema]);

  const selectTitle = useMemo(() => {
    const { serviceName } = config;
    const target = serviceNameSchema.get(serviceName ?? "");
    if (target) {
      const { requestSchema, responseSchema } = target;
      return formatTitle(requestSchema, responseSchema);
    }

    return <></>;
  }, [config, serviceNameSchema]);

  useEffect(() => {
    context.saveState(config);
    context.setDefaultPanelTitle(
      config.serviceName ? `Call service ${config.serviceName}` : undefined,
    );
  }, [config, context]);

  useEffect(() => {
    context.watch("colorScheme");

    context.onRender = (renderState, done) => {
      setRenderDone(() => done);
      setColorScheme(renderState.colorScheme ?? "light");
    };

    return () => {
      context.onRender = undefined;
    };
  }, [context, setColorScheme]);

  const { error: requestParseError, parsedObject } = useMemo(
    () => parseInput(config.requestPayload ?? ""),
    [config.requestPayload],
  );

  const settingsActionHandler = useCallback(
    (action: SettingsTreeAction) => {
      setConfig((prevConfig) => settingsActionReducer(prevConfig, action));
    },
    [setConfig],
  );

  const settingsTree = useSettingsTree(config);
  useEffect(() => {
    context.updatePanelSettingsEditor({
      actionHandler: settingsActionHandler,
      nodes: settingsTree,
    });
  }, [context, settingsActionHandler, settingsTree]);

  const statusMessage = useMemo(() => {
    if (context.callService == undefined) {
      return "Connect to a data source that supports calling services";
    }
    if (!config.serviceName) {
      return "Select the service in the drop-down box";
    }
    return undefined;
  }, [context, config.serviceName]);

  const canCallService = Boolean(
    context.callService != undefined &&
      config.requestPayload &&
      config.serviceName &&
      parsedObject != undefined &&
      state?.status !== "requesting",
  );

  const callServiceClicked = useCallback(async () => {
    if (!context.callService) {
      setState({ status: "error", value: "The data source does not allow calling services" });
      return;
    }

    try {
      setState({ status: "requesting", value: `Calling ${config.serviceName}...` });
      const response = await promiseTimeout(context.callService(config.serviceName!, JSON.parse(config.requestPayload!)),config.requestTimeout * 1000)
      setState({ status: "success", value: JSON.stringify(response, undefined, 2) ?? "" });
    } catch (err) {
      setState({ status: "error", value: (err as Error).message });
      log.error(err);
    }
  }, [context, config.serviceName, config.requestPayload, config.requestTimeout]);

  // Indicate render is complete - the effect runs after the dom is updated
  useEffect(() => {
    renderDone();
  }, [renderDone]);

  return (
    <Stack flex="auto" gap={1} padding={1.5} position="relative" fullHeight>
      <Stack>
        <FormControl fullWidth>
          <Typography variant="caption" noWrap>
            Service name
          </Typography>
          <Select
            // Disables auto focus on MenuItems and allows TextField to be in focus
            MenuProps={{ autoFocus: false }}
            value={config.serviceName}
            variant="outlined"
            size="small"
            onChange={(event) => {
              const serviceName = event.target.value;
              const target = serviceNameSchema.get(serviceName);
              if (target) {
                const { requestComposedDefinitions } = target;
                const requestPayload = JSON.stringify(requestComposedDefinitions, undefined, 2);
                setConfig({ ...config, serviceName, requestPayload });
                return;
              }
              setConfig({ ...config, serviceName });
            }}
            onClose={() => { setSearchText(""); }}
            startAdornment={
              <InputAdornment position="start">
                <Tooltip title={selectTitle}>
                  <HelpIcon />
                </Tooltip>
              </InputAdornment>
            }
          >
            <ListSubheader>
              <TextField
                size="small"
                autoFocus
                placeholder="Type to search..."
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                onChange={(e) => { setSearchText(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key !== "Escape") {
                    // Prevents autoselecting item while typing (default Select behaviour)
                    e.stopPropagation();
                  }
                }}
              />
            </ListSubheader>
            {displayedOptions.map(({ serviceName, title }) => (
              <MenuItem value={serviceName} key={serviceName}>
                <Tooltip title={title} placement="bottom-start">
                  <span>{serviceName}</span>
                </Tooltip>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
      <Stack gap={1} flexGrow="1" direction={config.layout === "horizontal" ? "row" : "column"}>
        <Stack flexGrow="1">
          <Typography variant="caption" noWrap>
            Request
          </Typography>
          <TextField
            variant="outlined"
            className={classes.textarea}
            multiline
            size="small"
            placeholder="Enter service request as JSON"
            value={config.requestPayload}
            onChange={(event) => {
              setConfig({ ...config, requestPayload: event.target.value });
            }}
            error={requestParseError != undefined}
          />
          {requestParseError && (
            <Typography variant="caption" noWrap color={requestParseError ? "error" : undefined}>
              {requestParseError}
            </Typography>
          )}
        </Stack>
        <Stack flexGrow="1">
          <Typography variant="caption" noWrap>
            Response
          </Typography>
          <TextField
            variant="outlined"
            className={classes.textarea}
            multiline
            size="small"
            placeholder="Response"
            value={state?.value}
            error={state?.status === "error"}
          />
        </Stack>
      </Stack>
      <Stack
        direction="row"
        justifyContent="flex-end"
        alignItems="center"
        overflow="hidden"
        flexGrow={0}
        gap={1.5}
      >
        {statusMessage && (
          <Typography variant="caption" noWrap>
            {statusMessage}
          </Typography>
        )}
        <Tooltip title={config.buttonTooltip}>
          <span>
            <Button
              className={classes.button}
              variant="contained"
              disabled={!canCallService}
              onClick={callServiceClicked}
              data-testid="call-service-button"
            >
              {config.buttonText ? config.buttonText : `Call service ${config.serviceName ?? ""}`}
            </Button>
          </span>
        </Tooltip>
      </Stack>
    </Stack>
  );
}
