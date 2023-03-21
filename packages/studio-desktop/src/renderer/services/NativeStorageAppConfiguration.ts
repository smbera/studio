// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { Mutex } from "async-mutex";

import { IAppConfiguration, AppConfigurationValue, ChangeHandler } from "@foxglove/studio-base";

import { SETTINGS_DATASTORE_NAME, SETTINGS_JSON_DATASTORE_KEY } from "../../common/storage";
import { Storage } from "../../common/types";

export default class NativeStorageAppConfiguration implements IAppConfiguration {
  private static STORE_NAME = SETTINGS_DATASTORE_NAME;
  private static STORE_KEY = SETTINGS_JSON_DATASTORE_KEY;

  private readonly _ctx: Storage;
  private _listeners = new Map<string, Set<ChangeHandler>>();

  // Protect access to currentValue to avoid read-modify-write races between multiple set() calls.
  private _mutex = new Mutex();
  private _currentValue: unknown;

  // Use OsContextAppConfiguration.initialize to create a new instance
  private constructor(ctx: Storage, initialValue?: unknown) {
    this._ctx = ctx;
    this._currentValue = initialValue;
  }

  // create a new OsContextAppConfiguration
  public static async Initialize(
    ctx: Storage,
    options: { defaults?: { [key: string]: AppConfigurationValue } } = {},
  ): Promise<NativeStorageAppConfiguration> {
    const { defaults } = options;
    const value = await ctx.get(
      NativeStorageAppConfiguration.STORE_NAME,
      NativeStorageAppConfiguration.STORE_KEY,
      { encoding: "utf8" },
    );
    const currentValue = JSON.parse(value ?? "{}");
    const config = new NativeStorageAppConfiguration(ctx, { ...defaults, ...currentValue });

    return config;
  }

  public get(key: string): AppConfigurationValue | undefined {
    return (this._currentValue as Record<string, AppConfigurationValue>)[key];
  }

  public async set(key: string, value: AppConfigurationValue): Promise<void> {
    await this._mutex.runExclusive(async () => {
      const currentConfig = await this._ctx.get(
        NativeStorageAppConfiguration.STORE_NAME,
        NativeStorageAppConfiguration.STORE_KEY,
        { encoding: "utf8" },
      );

      const newConfig: unknown = { ...JSON.parse(currentConfig ?? "{}"), [key]: value };

      await this._ctx.put(
        NativeStorageAppConfiguration.STORE_NAME,
        NativeStorageAppConfiguration.STORE_KEY,
        JSON.stringify(newConfig) ?? "",
      );
      this._currentValue = newConfig;
    });
    const listeners = this._listeners.get(key);
    if (listeners) {
      // Copy the list of listeners to protect against mutation during iteration
      [...listeners].forEach((listener) => listener(value));
    }
  }

  public addChangeListener(key: string, cb: ChangeHandler): void {
    let listeners = this._listeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this._listeners.set(key, listeners);
    }
    listeners.add(cb);
  }

  public removeChangeListener(key: string, cb: ChangeHandler): void {
    const listeners = this._listeners.get(key);
    if (listeners) {
      listeners.delete(cb);
    }
  }
}
