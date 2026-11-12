// SmartScan workspace state (pure reducer, no browser APIs).
//
// One photo stays open while the user recognizes text, selects a passage with
// two taps, edits it as a quote draft, saves, and selects the next passage.
// Saving never discards the photo, the OCR words, or the zoom/rotation.
// Author and source defaults come from the reading session (readingSession.js),
// which outlives this workspace so it carries across photographs.

import { joinWords } from '../selection/readingOrder.js';
import { EMPTY_SELECTION, selectionPhase, tapWord } from '../selection/selection.js';
import { nextRotation } from './viewport.js';

export const OCR_STATUS = { IDLE: 'idle', RUNNING: 'running', READY: 'ready', ERROR: 'error' };

export const initialWorkspaceState = {
  rotation: 0,
  ocr: { status: OCR_STATUS.IDLE, phase: '', progress: 0, message: null },
  words: [], // reading order, see selection/readingOrder.js
  selection: EMPTY_SELECTION,
  saved: [], // [{ start, end }] passages already saved from this photo
  draft: null, // { quote, author, source, tags, notes } while the editor is open
  draftRange: null,
  saving: false,
  notice: null, // { kind: 'info' | 'success' | 'error', text }
};

export function workspaceReducer(state, action) {
  switch (action.type) {
    case 'ROTATE':
      if (state.draft) return state;
      return {
        ...state,
        rotation: nextRotation(state.rotation),
        ocr: { ...initialWorkspaceState.ocr },
        words: [],
        selection: EMPTY_SELECTION,
        saved: [], // word indices belong to the old orientation
        notice: null,
      };

    case 'OCR_START':
      return {
        ...state,
        ocr: { status: OCR_STATUS.RUNNING, phase: 'Preparing photo…', progress: 0, message: null },
        words: [],
        selection: EMPTY_SELECTION,
      };

    case 'OCR_PROGRESS':
      return { ...state, ocr: { ...state.ocr, phase: action.phase, progress: action.progress ?? state.ocr.progress } };

    case 'OCR_SUCCESS':
      return {
        ...state,
        ocr: { status: OCR_STATUS.READY, phase: '', progress: 1, message: null },
        words: action.words,
        notice: action.words.length
          ? null
          : { kind: 'error', text: 'No text was found. Try rotating the photo, or take a sharper, well-lit photo.' },
      };

    case 'OCR_FAILURE':
      return { ...state, ocr: { status: OCR_STATUS.ERROR, phase: '', progress: 0, message: action.message } };

    case 'TAP':
      if (state.draft || state.ocr.status !== OCR_STATUS.READY) return state;
      return { ...state, selection: tapWord(state.selection, action.index), notice: null };

    case 'CLEAR_SELECTION':
      return { ...state, selection: EMPTY_SELECTION };

    case 'OPEN_DRAFT': {
      if (selectionPhase(state.selection) !== 'selected') return state;
      const { start, end } = state.selection;
      return {
        ...state,
        draft: {
          quote: joinWords(state.words, start, end),
          author: action.reading?.author ?? '',
          source: action.reading?.source ?? '',
          tags: [],
          notes: '',
        },
        draftRange: { start, end },
        notice: null,
      };
    }

    case 'EDIT_DRAFT':
      if (!state.draft) return state;
      return { ...state, draft: { ...state.draft, [action.field]: action.value } };

    case 'CANCEL_DRAFT':
      if (state.saving) return state;
      return { ...state, draft: null, draftRange: null, notice: null };

    case 'SAVE_START':
      return { ...state, saving: true, notice: null };

    case 'SAVE_SUCCESS':
      return {
        ...state,
        saving: false,
        draft: null,
        draftRange: null,
        saved: state.draftRange ? [...state.saved, state.draftRange] : state.saved,
        selection: EMPTY_SELECTION,
        notice: { kind: 'success', text: 'Quote saved. Tap another passage to keep going.' },
      };

    case 'SAVE_FAILURE':
      return { ...state, saving: false, notice: { kind: 'error', text: action.message } };

    case 'NOTICE':
      return { ...state, notice: action.notice };

    default:
      return state;
  }
}
