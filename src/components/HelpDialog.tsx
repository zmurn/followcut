import { Modal } from './Modal';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  return (
    <Modal
      id="help"
      open={open}
      onClose={onClose}
      title="How FOLLOW/CUT works"
      description="A local review deck and a cleanup list. You perform every unfollow yourself."
      wide
      footer={<button type="button" class="btn btn--ink" onClick={onClose}>Got it</button>}
    >
      <div class="help-sections">
        <section>
          <h3>Cut is a plan, not an action</h3>
          <p>
            <strong>Cut</strong> marks an account for your cleanup queue. It does not unfollow anyone, and FOLLOW/CUT never
            contacts Instagram. Only you can confirm a manual unfollow after you have done it on Instagram.
          </p>
        </section>
        <section>
          <h3>Review shortcuts</h3>
          <table class="shortcut-table">
            <thead><tr><th>Key</th><th>Action</th></tr></thead>
            <tbody>
              <tr><td><kbd>←</kbd></td><td>Cut — mark for cleanup</td></tr>
              <tr><td><kbd>→</kbd></td><td>Keep</td></tr>
              <tr><td><kbd>↓</kbd></td><td>Maybe — revisit later</td></tr>
              <tr><td><kbd>Space</kbd></td><td>Open the full profile in a new tab</td></tr>
              <tr><td><kbd>S</kbd></td><td>Star / unstar</td></tr>
              <tr><td><kbd>L</kbd></td><td>Lock / unlock against bulk operations</td></tr>
              <tr><td><kbd>Z</kbd></td><td>Undo the last decision</td></tr>
              <tr><td><kbd>?</kbd></td><td>This help</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <h3>Cleanup shortcuts</h3>
          <table class="shortcut-table">
            <thead><tr><th>Key</th><th>Action</th></tr></thead>
            <tbody>
              <tr><td><kbd>Enter</kbd></td><td>Open the active profile</td></tr>
              <tr><td><kbd>C</kbd></td><td>Confirm: "I unfollowed this account"</td></tr>
              <tr><td><kbd>S</kbd></td><td>Skip for now</td></tr>
              <tr><td><kbd>K</kbd></td><td>Actually keep</td></tr>
              <tr><td><kbd>U</kbd></td><td>Mark uncertain</td></tr>
              <tr><td><kbd>Z</kbd></td><td>Undo the last cleanup action</td></tr>
            </tbody>
          </table>
          <p class="rail-note" style={{ marginTop: '8px' }}>
            Shortcuts pause while you are typing in a field or while a dialog is open.
          </p>
        </section>
        <section>
          <h3>What the numbers mean</h3>
          <ul>
            <li><strong>Snapshot:</strong> what your export said on its export date. It is not live Instagram data.</li>
            <li><strong>Estimated following:</strong> snapshot following minus confirmed manual unfollows. Pending cuts do not count.</li>
            <li><strong>Projected following:</strong> what the count would be if every pending cut were confirmed. Still an estimate.</li>
            <li><strong>Follow-back status:</strong> only shown when a usable follower list was included in the export.</li>
          </ul>
        </section>
        <section>
          <h3>Profile previews</h3>
          <p>
            Instagram's export contains usernames, not profile photos, bios, or posts, and FOLLOW/CUT never scrapes the
            site. Instagram does serve a first-party profile embed. With card previews set to <strong>In-app</strong>, a low-resolution post strip appears in the current card and the next profile is preloaded; Cut, Maybe, or Keep reveals the next already-loaded strip. There is no popup. The preview is visual only; <strong>Open profile</strong> opens the full profile. Card previews are off by default. The app never reads or stores the embed. Private accounts may be limited.
          </p>
        </section>
        <section>
          <h3>Privacy</h3>
          <p>
            The standalone app has no server, no login, and no analytics. Your archive is read in this tab. The app's own
            code cannot fetch or upload data: its CSP blocks fetch/XHR, external scripts, fonts and images. The one
            deliberate exception is Instagram's first-party card preview, loaded only after you enable In-app and only for
            the current and next profile; the app never reads that frame. The optional phone handoff runs a temporary server on your computer only. Decisions are
            stored in this browser; download a backup if you want a portable copy.
          </p>
        </section>
      </div>
    </Modal>
  );
}
