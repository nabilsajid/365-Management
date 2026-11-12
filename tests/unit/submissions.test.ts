import assert from 'node:assert/strict';
import { test } from 'node:test';
import { submissionProblem } from '../../src/lib/domain/submissions';

test('Drive and Dropbox links are accepted', () => {
  assert.equal(submissionProblem({ kind: 'drive', url: 'https://drive.google.com/file/d/abc/view' }), null);
  assert.equal(submissionProblem({ kind: 'drive', url: 'https://docs.google.com/document/d/abc' }), null);
  assert.equal(submissionProblem({ kind: 'dropbox', url: 'https://www.dropbox.com/s/abc/final.mp4' }), null);
});

test('a text note is accepted without a link', () => {
  assert.equal(submissionProblem({ kind: 'text', note: 'Uploaded to the shared drive, v3.' }), null);
});

test('a link submission needs a link', () => {
  assert.match(submissionProblem({ kind: 'drive' }) ?? '', /needs a link/);
  assert.match(submissionProblem({ kind: 'dropbox', url: '   ' }) ?? '', /needs a link/);
});

test('a text submission needs a note', () => {
  assert.match(submissionProblem({ kind: 'text', note: '  ' }) ?? '', /needs a note/);
});

test('links must belong to the chosen service', () => {
  assert.match(submissionProblem({ kind: 'drive', url: 'https://www.dropbox.com/s/abc' }) ?? '', /not a Google Drive link/);
  assert.match(submissionProblem({ kind: 'dropbox', url: 'https://drive.google.com/file/d/abc' }) ?? '', /not a Dropbox link/);
  assert.match(submissionProblem({ kind: 'drive', url: 'https://drive.google.com.evil.example/x' }) ?? '', /not a Google Drive link/);
});

test('malformed and non-https links are rejected', () => {
  assert.match(submissionProblem({ kind: 'drive', url: 'drive.google.com/abc' }) ?? '', /not a valid URL/);
  assert.match(submissionProblem({ kind: 'drive', url: 'http://drive.google.com/abc' }) ?? '', /https/);
});
