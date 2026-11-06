
function injectFramebufIndex(stateProps, dispatchProps) {
  let newDispatch = {};
  Object.keys(dispatchProps).forEach(key => {
    const c = dispatchProps[key];
    // The raw store `dispatch` function is a shared primitive, not an
    // action-creator keyed by the currently-active framebuf -- callers that
    // pass it through (e.g. Editor.tsx, to dispatch a thunk that captures
    // its own target framebufIndex at call time) need it completely
    // unmodified. Appending the *current* framebufIndex here would silently
    // reintroduce the "applies to whatever screen is active now" bug for
    // any async thunk dispatched through it.
    if (key === 'dispatch') {
      newDispatch[key] = c;
    } else if (typeof c === 'function') {
      newDispatch[key] = (...args) => {
        c(...args, stateProps.framebufIndex);
      }
    } else {
      newDispatch[key] = {};
      const children = c;
      Object.keys(children).forEach(ck => {
        const f = children[ck];
        newDispatch[key][ck] = (...args) => {
          f(...args, stateProps.framebufIndex);
        }
      })
    }
  });
  return newDispatch;
}

export const framebufIndexMergeProps = (stateProps, dispatchProps, ownProps) => {
  return {
    ...ownProps,
    ...stateProps,
    ...injectFramebufIndex(stateProps, dispatchProps)
  };
}

export const makeScreenName = (idx) => {
  const str = `${idx + 1}`;
  return `screen_${str.padStart(3, '0')}`;
}
export const makeDirArtName = (idx) => {
  const str = `${idx + 1}`;
  return `DIRART ${str.padStart(3, '0')},2A`;
}