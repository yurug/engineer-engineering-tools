// Module: static-web -- re-exports @brief/core's SPA-serving mechanism
// (ADR-001) -- already fully parameterized by `webDistDir` in the original,
// so nothing to decouple.
export { mountStaticWeb } from "@brief/core";
