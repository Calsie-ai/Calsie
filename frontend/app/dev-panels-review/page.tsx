"use client";

import GmailPanel from "../dashboard/GmailPanel";

const idleAction = { status: "idle", error: "" } as never;

export default function DevPage() {
  return (
    <>
      <GmailPanel gmailReady={false} actionStates={{ connectGmail: idleAction, revokeGmail: idleAction } as never} onConnectGmail={() => {}} onRevokeGmail={() => {}} />
      <label className="ws-builder-checkbox" style={{ marginTop: 40 }}>
        <input type="checkbox" defaultChecked /> builder checkbox probe
      </label>
    </>
  );
}
