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

import { rosPrimitiveTypes, Time } from "rosbag";

import { RosDatatypes } from "@foxglove-studio/app/types/RosDatatypes";
import { isComplex } from "@foxglove-studio/app/util/binaryObjects/messageDefinitionUtils";

function getPrimitiveDefault(
  type: string,
): string | boolean | number | Time | Record<string, unknown> | undefined {
  if (type === "string") {
    return "";
  } else if (type === "bool") {
    return false;
  } else if (type === "float32" || type === "float64") {
    return NaN;
  } else if (
    type === "int8" ||
    type === "uint8" ||
    type === "int16" ||
    type === "uint16" ||
    type === "int32" ||
    type === "uint32" ||
    type === "int64" ||
    type === "uint64"
  ) {
    return 0;
  } else if (type === "time" || type === "duration") {
    return { sec: 0, nsec: 0 };
  } else if (type === "json") {
    return {};
  }
  return undefined;
}

// Provides (nested, recursive) defaults for a message of a given datatype. Modifies messages in-place for performance.
export default function addMessageDefaults(
  datatypes: RosDatatypes,
  datatypeName: string,
  object: any,
): void {
  if (!datatypes[datatypeName]) {
    throw new Error(`addMessageDefaults: datatype "${datatypeName}" missing from datatypes`);
  }
  for (const { name, type, isConstant, isArray } of datatypes[datatypeName].fields) {
    // Don't set any constant fields - they are not written anyways.
    if (!isConstant && object[name] == undefined) {
      if (isArray) {
        object[name] = [];
      } else if (rosPrimitiveTypes.has(type)) {
        object[name] = getPrimitiveDefault(type);
      } else if (isComplex(type)) {
        object[name] = {};
        addMessageDefaults(datatypes, type, object[name]);
      } else {
        throw new Error(
          `addMessageDefaults: object of type "${datatypeName}" is missing field "${name}"`,
        );
      }
    } else if (!isConstant && isComplex(type)) {
      if (isArray) {
        for (const index in object[name]) {
          addMessageDefaults(datatypes, type, object[name][index]);
        }
      } else {
        addMessageDefaults(datatypes, type, object[name]);
      }
    } else if (!isConstant && isArray) {
      for (const index in object[name]) {
        if (object[name][index] == undefined) {
          object[name][index] = getPrimitiveDefault(type);
        }
      }
    }
  }
}
