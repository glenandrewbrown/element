// Applies the Storybook project annotations (preview.ts decorators, params,
// globals) to every story when it runs under Vitest's browser project, so a
// story-as-test renders with the same dark theme / backgrounds / a11y config
// it gets in the Storybook UI.
import { beforeAll } from "vitest";
import { setProjectAnnotations } from "@storybook/react-vite";
import * as projectAnnotations from "./preview";

const project = setProjectAnnotations([projectAnnotations]);

beforeAll(project.beforeAll);
