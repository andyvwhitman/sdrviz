import { mount } from "svelte";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow-semi-condensed/400.css";
import "@fontsource/barlow-semi-condensed/500.css";
import "@fontsource/barlow-semi-condensed/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "$lib/styles/index.css";
import "./app.css";
import App from "./App.svelte";
import { boot } from "$lib/boot";

boot().then(() => mount(App, { target: document.getElementById("app")! }));
