/** Pure helpers for the station board and the trip's stop rows: the merged time cell, state words, track, from/to. */

import { BLANK } from "$lib/hud/fmt";
import type { BoardRow, StateBasis } from "$lib/types/transit";
import { hhmm } from "./transitView";

/** Stations where Amtrak announces tracks: an Amtrak row with no track there reads "TBD". */
export const TRACK_STATIONS: readonly string[] = ["WAS", "BAL", "NYP"];

export interface TimeCell {
  /** the timetable's time, struck through, only when the expected time differs from it */
  scheduled: string | null;
  /** the time to read: expected when there is realtime, else the timetable's */
  time: string;
}

/** One time per row: the expected time, with the scheduled one struck beside it when they differ. */
export function timeCell(scheduled: string | null, estimated: string | null): TimeCell {
  const sched = hhmm(scheduled);
  if (!estimated) return { scheduled: null, time: sched };
  const est = hhmm(estimated);
  return { scheduled: est === sched ? null : sched, time: est };
}

/**
 * What a passed row says. Only a train whose position says so may read LEFT (departures) or IN (arrivals); one passed
 * by the clock alone is an estimate and says so.
 */
export function stateWord(row: Pick<BoardRow, "state" | "state_basis">, tab: "departures" | "arrivals"): string {
  if (row.state !== "passed") return "";
  if (row.state_basis === "clock") return "EST. PASSED";
  return tab === "departures" ? "LEFT" : "IN";
}

/** "4" when the agency gave a track, "TBD" for an Amtrak row at a station that announces tracks, else nothing. */
export function trackCell(row: Pick<BoardRow, "track" | "source">, stationCode: string | null | undefined): string {
  if (row.track) return row.track;
  return row.source === "amtrak" && !!stationCode && TRACK_STATIONS.includes(stationCode.toUpperCase()) ? "TBD" : "";
}

/** The far end of the row: arrivals show where the train came FROM, departures where it goes TO. */
export function endpoint(row: Pick<BoardRow, "origin" | "destination" | "headsign" | "route_name">, tab: "departures" | "arrivals"): string {
  const name = tab === "arrivals" ? (row.origin ?? row.headsign) : (row.destination ?? row.headsign ?? row.route_name);
  return name ?? BLANK;
}

/** The station code in a stop id: "st:was" and "amtrak:WAS" both give "WAS"; anything else null. */
export function stopCode(stopId: string): string | null {
  const m = /^(?:st|amtrak):([A-Za-z]{3})$/.exec(stopId);
  return m ? m[1].toUpperCase() : null;
}

export interface StopTimes {
  /** arrival time, shown when the train layovers (arrival and departure differ) */
  arrival: string | null;
  /** the departure time, or the only time of the stop */
  time: string;
  /** the timetable's times, for the hover */
  title: string;
}

interface StopTimeFields {
  arr_scheduled: string | null;
  arr_estimated: string | null;
  dep_scheduled: string | null;
  dep_estimated: string | null;
}

/**
 * A trip stop's times: one time, or an arrival and departure pair where they differ (a layover). First and last
 * stops have only one. The expected time is used where there is realtime.
 */
export function stopTimes(s: StopTimeFields): StopTimes {
  const arr = s.arr_estimated ?? s.arr_scheduled;
  const dep = s.dep_estimated ?? s.dep_scheduled;
  const sched = (iso: string | null, est: string | null): string => `${hhmm(iso)}${est ? ` · EXPECTED ${hhmm(est)}` : ""}`;
  const title = [
    s.arr_scheduled ? `ARRIVES SCHEDULED ${sched(s.arr_scheduled, s.arr_estimated)}` : "",
    s.dep_scheduled ? `DEPARTS SCHEDULED ${sched(s.dep_scheduled, s.dep_estimated)}` : "",
    !(s.arr_estimated || s.dep_estimated) ? "NO REALTIME" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (arr && dep && hhmm(arr) !== hhmm(dep)) return { arrival: hhmm(arr), time: hhmm(dep), title };
  return { arrival: null, time: hhmm(dep ?? arr), title };
}

/** A current or next stop that only the clock says so: marked as an estimate. */
export const estMark = (basis: StateBasis | undefined): string => (basis === "clock" ? "EST. " : "");
