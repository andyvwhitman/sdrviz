import { mount } from "svelte";
import "@fontsource/barlow/400.css";
import "$lib/styles/index.css";
import "./app.css";
import "./screens/live-ops/live-ops.css";
import Harness from "./Harness.svelte";
import { boot } from "$lib/boot";
boot().then(() => mount(Harness, { target: document.getElementById("app")! }));
