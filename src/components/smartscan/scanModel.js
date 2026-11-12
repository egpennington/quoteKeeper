// SmartScan workflow state.
//
// Full pipeline: Photo -> Text Recognition -> Passage Selection -> Review -> Save
// This reducer covers getting a photo. Once a photo is loaded, the full-screen
// workspace (workspace/workspaceModel.js) runs recognition, selection, review,
// and save, and stays on that photo until the user closes it.

export const STAGES = {
  SOURCE: 'source', // choose Take Photo / Upload Photo
  CAMERA: 'camera', // live camera preview
  WORKSPACE: 'workspace', // photo open: recognize, select, edit, save
};

export const initialScanState = {
  stage: STAGES.SOURCE,
  image: null, // see loadScanImage() in imageUtils.js
  busy: false, // a photo is being validated/decoded
  notice: null, // { kind: 'error' | 'success' | 'info', text }
};

export function scanReducer(state, action) {
  switch (action.type) {
    case 'OPEN_CAMERA':
      return { ...state, stage: STAGES.CAMERA, notice: null };

    case 'CLOSE_CAMERA':
      return {
        ...state,
        stage: state.image ? STAGES.WORKSPACE : STAGES.SOURCE,
        notice: action.notice ?? null,
      };

    case 'START_REPLACE':
      return { ...state, stage: STAGES.SOURCE, notice: null };

    case 'CANCEL_REPLACE':
      return { ...state, stage: state.image ? STAGES.WORKSPACE : STAGES.SOURCE, notice: null };

    case 'LOAD_START':
      return { ...state, stage: STAGES.SOURCE, busy: true, notice: { kind: 'info', text: 'Loading photo…' } };

    case 'LOAD_SUCCESS':
      return {
        ...state,
        busy: false,
        stage: STAGES.WORKSPACE,
        image: action.image,
        notice: {
          kind: 'success',
          text: action.image.source === 'camera' ? 'Photo captured.' : 'Photo added.',
        },
      };

    case 'LOAD_FAILURE':
      return { ...state, busy: false, notice: { kind: 'error', text: action.message } };

    case 'REMOVE_IMAGE':
      return { ...state, stage: STAGES.SOURCE, image: null, notice: { kind: 'info', text: 'Photo removed.' } };

    case 'SET_NOTICE':
      return { ...state, notice: action.notice };

    default:
      return state;
  }
}
