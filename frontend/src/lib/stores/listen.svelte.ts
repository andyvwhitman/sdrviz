/**
 * The node this browser listens to. It belongs to this client alone: it is kept in localStorage, sent to the server
 * in the socket URL (`?listen=`) and with the `listen` op, and the server answers with a snapshot for that node
 * only. Nothing here is shared with other clients. null means "the server's default" (the first online node).
 */

const KEY = "sdrviz.listen.v1";

/** The saved choice; storage can be blocked or hold junk, then it is the default. */
export function readListenFeed(): string | null {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? saved : null;
  } catch {
    return null;
  }
}

function saveListenFeed(feedId: string): void {
  try {
    localStorage.setItem(KEY, feedId);
  } catch {
    // not remembered
  }
}

class ListenStore {
  feedId = $state<string | null>(readListenFeed());

  private send: (feedId: string) => void = () => {};

  /** The connection registers how to tell the server. */
  bind(send: (feedId: string) => void): void {
    this.send = send;
  }

  /** Listen to another node: remember it and tell the server (any role may; it changes nothing shared). */
  choose(feedId: string): void {
    if (feedId === this.feedId) return;
    this.feedId = feedId;
    saveListenFeed(feedId);
    this.send(feedId);
  }
}

export const listen = new ListenStore();
