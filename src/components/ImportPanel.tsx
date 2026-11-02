import { useEffect, useRef, useState } from 'preact/hooks';
import type { DatasetCandidate, ImportAnalysis, ImportErrorCode } from '../lib/types';
import { ImportError } from '../lib/types';
import { analyzeUploads, schemaReportText, type UploadFile } from '../lib/parse';
import { downloadJson, downloadText, copyText } from '../lib/download';
import { formatDate } from '../lib/selectors';
import { Icon } from './Icon';

interface ImportPanelProps {
  onCandidate: (candidate: DatasetCandidate) => void;
  compact?: boolean;
}

type Phase = 'idle' | 'reading' | 'choose' | 'done' | 'error';

const ERROR_COPY: Record<ImportErrorCode, { title: string; body: string }> = {
  ZIP_INVALID: {
    title: 'That file is not a ZIP',
    body: 'Choose the ZIP Meta gave you, or select the JSON files directly. FOLLOW/CUT does not need you to unzip anything.'
  },
  ZIP_ENCRYPTED: {
    title: 'This ZIP is password protected',
    body: 'Meta exports are not password protected. Download the archive again from Meta and choose the new file.'
  },
  ZIP_TOO_LARGE: {
    title: 'This archive is too large to read safely',
    body: 'Export only "Followers and following" to keep the archive small. FOLLOW/CUT never needs your photos or messages.'
  },
  ZIP_CORRUPT: {
    title: 'The ZIP looks incomplete or damaged',
    body: 'The download may have stopped early. Download the archive again from Meta before importing it.'
  },
  ZIP_UNSUPPORTED: {
    title: 'This ZIP shape is not supported',
    body: 'Choose one ZIP at a time, or unzip the export yourself and choose the folder containing following.json.'
  },
  ZIP64_UNSUPPORTED: {
    title: 'This is a ZIP64 archive',
    body: 'This build cannot read ZIP64 archives. Export only "Followers and following" to keep the file small, or unzip it and choose the folder.'
  },
  FILE_TOO_LARGE: {
    title: 'One of these files is too large',
    body: 'Select the Instagram ZIP, or only the following and followers JSON files. Images and videos are not needed.'
  },
  HTML_EXPORT: {
    title: 'This is an HTML export. FOLLOW/CUT needs JSON.',
    body: 'Request the export again and choose JSON as the format. HTML has no reliable machine-readable follower list, so it is not silently accepted.'
  },
  NO_DATA: {
    title: 'No following list was found',
    body: 'The archive was read, but it did not contain following.json. Request "Followers and following" with date range All time and format JSON.'
  },
  EMPTY_FOLLOWING: {
    title: 'The following list is empty',
    body: 'This export may be for the wrong account or the wrong date range. Request it again with All time selected.'
  },
  BAD_JSON: {
    title: 'The follower data is not valid JSON',
    body: 'The download may be incomplete, or Meta may have changed the export schema. The app failed safely; it did not guess at your accounts.'
  },
  TOO_MANY_ACCOUNTS: {
    title: 'This export is larger than the safety limit',
    body: 'FOLLOW/CUT caps imports at 100,000 accounts to protect the tab. Check that you chose the right account archive.'
  },
  UNSUPPORTED_BROWSER: {
    title: 'This browser cannot read ZIP compression',
    body: 'Use a current Chrome, Safari, Edge or Firefox. You can also unzip the export and choose the folder, or choose the JSON files directly.'
  },
  READ_FAILED: {
    title: 'The file could not be read',
    body: 'Try choosing it again, or read it from a local folder instead of a synced or network drive.'
  }
};

function friendlyError(error: unknown): { title: string; body: string; detail?: string; schema?: ImportAnalysis['schema'] } {
  if (error instanceof ImportError) {
    const copy = ERROR_COPY[error.code] ?? { title: 'Import failed', body: 'The file could not be read.' };
    return { ...copy, detail: error.detail, schema: error.schema };
  }
  return {
    title: 'Import failed unexpectedly',
    body: error instanceof Error ? error.message : 'The file could not be read. No data was uploaded anywhere.'
  };
}

export function ImportPanel({ onCandidate, compact = false }: ImportPanelProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [error, setError] = useState<ReturnType<typeof friendlyError> | null>(null);
  const [candidates, setCandidates] = useState<DatasetCandidate[]>([]);
  const [success, setSuccess] = useState<DatasetCandidate | null>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState('Reading the archive…');
  const [copied, setCopied] = useState(false);
  const zipRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Preact does not reliably write this boolean-ish attribute, and Chrome needs
    // the attribute/property to turn the picker into a directory chooser.
    const input = folderRef.current;
    if (!input) return;
    input.setAttribute('webkitdirectory', '');
    (input as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true;
  }, []);

  useEffect(() => {
    if (phase === 'error') errorRef.current?.focus();
  }, [phase]);

  function choose(candidate: DatasetCandidate) {
    setSuccess(candidate);
    setPhase('done');
    setCandidates([]);
    onCandidate(candidate);
  }

  async function ingest(files: File[]) {
    setError(null);
    setAnalysis(null);
    setSuccess(null);
    setCandidates([]);
    setCopied(false);
    const usable = Array.from(files).filter(file => /\.(zip|json|html?)$/i.test(file.name));
    if (usable.length === 0) {
      setError({
        title: 'No importable file was chosen',
        body: 'Choose the ZIP Meta gave you, or the following.json / followers_1.json files. Folders can be selected with "Choose folder".'
      });
      setPhase('error');
      return;
    }
    setPhase('reading');
    setProgress('Reading the archive…');
    await new Promise(resolve => setTimeout(resolve, 40));
    try {
      const uploads: UploadFile[] = [];
      let total = 0;
      for (const file of usable.slice(0, 500)) {
        if (file.size > 256 * 1024 * 1024) {
          throw new ImportError('FILE_TOO_LARGE', `${file.name} is larger than the 256 MB safety limit.`);
        }
        total += file.size;
        if (total > 300 * 1024 * 1024) {
          throw new ImportError('FILE_TOO_LARGE', 'These files exceed the 300 MB selection safety limit.');
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        uploads.push({ name: file.name, path: relative || file.name, bytes });
      }
      setProgress('Finding following and followers…');
      await new Promise(resolve => setTimeout(resolve, 30));
      const result = await analyzeUploads(uploads);
      setAnalysis(result);
      if (result.candidates.length === 0) {
        setError({ title: 'No following list was found', body: 'The archive was read, but no usable following/followers data was found.' });
        setPhase('error');
        return;
      }
      if (result.candidates.length === 1) choose(result.candidates[0]);
      else {
        setCandidates(result.candidates);
        setPhase('choose');
      }
    } catch (err) {
      setError(friendlyError(err));
      setPhase('error');
    }
  }

  function onFileInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (files.length) void ingest(files);
  }

  async function copySchema() {
    if (!error?.schema) return;
    const text = schemaReportText(error.schema);
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } else {
      downloadText('followcut-schema-report.json', text, 'application/json');
      setCopied(true);
    }
  }

  return (
    <div class={`import-panel${compact ? ' import-panel--compact' : ''}`}>
      <div
        class={`dropzone${over ? ' is-over' : ''}${phase === 'reading' ? ' is-busy' : ''}`}
        onDragOver={event => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={event => {
          event.preventDefault();
          setOver(false);
          const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
          if (files.length) {
            void ingest(files);
          } else {
            setError({
              title: 'Nothing readable was dropped',
              body: 'Drop the ZIP file itself, or use “Choose folder” for an unzipped export. Browsers do not always expose folders in drag-and-drop.'
            });
            setPhase('error');
          }
        }}
      >
        <div class="dropzone__icon" aria-hidden="true">
          <Icon name={phase === 'reading' ? 'refresh' : 'file'} size={24} />
        </div>
        <p class="dropzone__title">Drop the ZIP here</p>
        <p class="dropzone__sub">Meta's archive can stay zipped. JSON files or an unzipped folder also work.</p>
        <div class="dropzone__row">
          <button type="button" class="btn btn--primary" id="choose-zip" onClick={() => zipRef.current?.click()} disabled={phase === 'reading'}>
            <Icon name="folder" size={16} /> Choose ZIP
          </button>
          <button type="button" class="btn" onClick={() => folderRef.current?.click()} disabled={phase === 'reading'}>
            <Icon name="folder" size={16} /> Choose folder
          </button>
        </div>
        <p class="dropzone__privacy">
          <Icon name="shield" size={13} /> Read on this device. Nothing is uploaded.
        </p>
        <input
          ref={zipRef}
          type="file"
          accept=".zip,.json,.html,application/zip,application/json"
          aria-label="Choose Instagram export ZIP or JSON files"
          onChange={onFileInput}
          multiple
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          aria-label="Choose the unzipped Instagram export folder"
          onChange={onFileInput}

        />
        {phase === 'reading' ? (
          <div class="progress-line" role="status">
            <span>{progress}</span>
            <span class="progress-line__bar" aria-hidden="true"><span /></span>
          </div>
        ) : null}
      </div>

      {phase === 'error' && error ? (
        <div class="import-report">
          <div class="import-error" tabIndex={-1} ref={errorRef} role="alert">
            <div class="import-error__head">
              <Icon name="alert" size={20} />
              <div>
                <h3>{error.title}</h3>
                <p>{error.body}</p>
                {error.detail ? <p>{error.detail}</p> : null}
              </div>
            </div>
            <div class="import-error__actions">
              <a
                class="btn btn--sm"
                href="https://accountscenter.instagram.com/info_and_permissions/dyi/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open export settings <Icon name="external" size={13} />
              </a>
              <button type="button" class="btn btn--sm" onClick={() => zipRef.current?.click()}>
                Choose another file
              </button>
              {error.schema ? (
                <>
                  <button type="button" class="btn btn--sm" onClick={() => void copySchema()}>
                    <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copied' : 'Copy anonymized schema report'}
                  </button>
                  <button type="button" class="btn btn--sm btn--ghost" onClick={() => downloadJson('followcut-schema-report.json', error.schema)}>
                    <Icon name="download" size={13} /> Download report
                  </button>
                </>
              ) : null}
            </div>
            {error.schema ? (
              <p class="rail-note" style={{ marginTop: '10px' }}>
                The report contains file names and key names only. No usernames, notes, or account identifiers.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase === 'choose' && candidates.length > 1 ? (
        <div class="import-report">
          <div class="callout callout--warn">
            <Icon name="alert" size={18} />
            <div>
              <strong>This archive has {candidates.length} separate account datasets.</strong>
              <div>They were not merged. Choose the one for the Instagram account you want to review.</div>
            </div>
          </div>
          <div class="dataset-list">
            {candidates.map(candidate => (
              <button type="button" class="dataset-option" key={candidate.snapshot.id} onClick={() => choose(candidate)}>
                <span class="radio" aria-hidden="true" />
                <span>
                  <b>{candidate.label}</b>
                  <span>
                    {candidate.snapshot.exportedAt ? `Export ${formatDate(candidate.snapshot.exportedAt)}` : 'Export date unknown'}
                    {candidate.snapshot.followerData === 'missing' ? ' · followers missing' : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button type="button" class="btn btn--sm btn--ghost" onClick={() => zipRef.current?.click()}>
            Choose another file
          </button>
        </div>
      ) : null}

      {phase === 'done' && success ? (
        <div class="import-report">
          <div class="import-ok" role="status">
            <Icon name="check" size={18} />
            <span>
              Read <strong>{success.accounts.length.toLocaleString()} following</strong>
              {success.snapshot.followerData === 'missing'
                ? ' · followers not found'
                : ` · ${success.followers.length.toLocaleString()} followers`}
              {success.snapshot.exportedAt ? ` · export ${formatDate(success.snapshot.exportedAt)}` : ''}
            </span>
            <span class="spacer" />
            <button type="button" class="btn btn--sm btn--ghost" onClick={() => zipRef.current?.click()}>
              Choose another
            </button>
          </div>
          {success.warnings.length ? (
            <ul class="import-warnings">
              {success.warnings.map(warning => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      {analysis && analysis.warnings.length > 0 && phase !== 'done' ? (
        <ul class="import-warnings">
          {analysis.warnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
