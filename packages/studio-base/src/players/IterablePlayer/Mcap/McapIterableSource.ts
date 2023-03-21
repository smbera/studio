// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { McapIndexedReader, McapTypes } from "@mcap/core";

import Log from "@foxglove/log";
import { loadDecompressHandlers } from "@foxglove/mcap-support";
import { MessageEvent } from "@foxglove/studio-base/players/types";

import { FileReadable } from "./FileReadable";
import { McapIndexedIterableSource } from "./McapIndexedIterableSource";
import { McapStreamingIterableSource } from "./McapStreamingIterableSource";
import { RemoteFileReadable } from "./RemoteFileReadable";
import {
  IIterableSource,
  IteratorResult,
  Initalization,
  MessageIteratorArgs,
  GetBackfillMessagesArgs,
} from "../IIterableSource";

const log = Log.getLogger(__filename);

type McapSource = { type: "file"; file: File } | { type: "url"; url: string };

async function tryCreateIndexedReader(readable: McapTypes.IReadable) {
  const decompressHandlers = await loadDecompressHandlers();
  try {
    const reader = await McapIndexedReader.Initialize({ readable, decompressHandlers });

    if (reader.chunkIndexes.length === 0 || reader.channelsById.size === 0) {
      return undefined;
    }
    return reader;
  } catch (err) {
    log.error(err);
    return undefined;
  }
}

export class McapIterableSource implements IIterableSource {
  private _source: McapSource;
  private _sourceImpl: IIterableSource | undefined;

  public constructor(source: McapSource) {
    this._source = source;
  }

  public async initialize(): Promise<Initalization> {
    const source = this._source;

    switch (source.type) {
      case "file": {
        // Ensure the file is readable before proceeding (will throw in the event of a permission
        // error). Workaround for the fact that `file.stream().getReader()` returns a generic
        // "network error" in the event of a permission error.
        await source.file.slice(0, 1).arrayBuffer();

        const readable = new FileReadable(source.file);
        const reader = await tryCreateIndexedReader(readable);
        if (reader) {
          this._sourceImpl = new McapIndexedIterableSource(reader);
        } else {
          this._sourceImpl = new McapStreamingIterableSource({
            size: source.file.size,
            stream: source.file.stream(),
          });
        }
        break;
      }
      case "url": {
        const readable = new RemoteFileReadable(source.url);
        await readable.open();
        const reader = await tryCreateIndexedReader(readable);
        if (reader) {
          this._sourceImpl = new McapIndexedIterableSource(reader);
        } else {
          const response = await fetch(source.url);
          if (!response.body) {
            throw new Error(`Unable to stream remote file. <${source.url}>`);
          }
          const size = response.headers.get("content-length");
          if (size == undefined) {
            throw new Error(`Remote file is missing Content-Length header. <${source.url}>`);
          }

          this._sourceImpl = new McapStreamingIterableSource({
            size: parseInt(size),
            stream: response.body,
          });
        }
        break;
      }
    }

    return await this._sourceImpl.initialize();
  }

  public messageIterator(
    opt: MessageIteratorArgs,
  ): AsyncIterableIterator<Readonly<IteratorResult>> {
    if (!this._sourceImpl) {
      throw new Error("Invariant: uninitialized");
    }

    return this._sourceImpl.messageIterator(opt);
  }

  public async getBackfillMessages(
    args: GetBackfillMessagesArgs,
  ): Promise<MessageEvent<unknown>[]> {
    if (!this._sourceImpl) {
      throw new Error("Invariant: uninitialized");
    }

    return await this._sourceImpl.getBackfillMessages(args);
  }
}
