import { framebufIndexMergeProps } from './utils';

describe('framebufIndexMergeProps', () => {
  test('appends the current framebufIndex to plain action-creator functions', () => {
    const setPixel = jest.fn();
    const stateProps = { framebufIndex: 3, someOtherState: 'x' };
    const dispatchProps = { setPixel };
    const merged = framebufIndexMergeProps(stateProps, dispatchProps, {});

    merged.setPixel({ row: 1, col: 2 }, 99);

    expect(setPixel).toHaveBeenCalledWith({ row: 1, col: 2 }, 99, 3);
  });

  test('appends the current framebufIndex to nested action-creator groups (e.g. Framebuffer/Toolbar)', () => {
    const setGuideLayer = jest.fn();
    const stateProps = { framebufIndex: 7 };
    const dispatchProps = { Framebuffer: { setGuideLayer } };
    const merged = framebufIndexMergeProps(stateProps, dispatchProps, {});

    merged.Framebuffer.setGuideLayer({ enabled: true });

    expect(setGuideLayer).toHaveBeenCalledWith({ enabled: true }, 7);
  });

  // Regression test for the Guide-layer async conversion race (Group B,
  // task B6): Editor.tsx now passes the raw store `dispatch` through
  // mapDispatchToProps so it can dispatch a thunk that captures its own
  // target framebufIndex and re-validates it at apply-time, instead of the
  // screen that happens to be active whenever the async conversion promise
  // resolves. If injectFramebufIndex ever started wrapping a literal
  // `dispatch` key like every other dispatch prop, it would silently reduce
  // every thunk dispatched through it to single-argument calls with a stale
  // trailing framebufIndex, which is never meaningful for the generic
  // redux-thunk `dispatch` signature.
  test('passes a literal `dispatch` key through completely unmodified', () => {
    const rawDispatch = jest.fn();
    const stateProps = { framebufIndex: 5 };
    const dispatchProps = { dispatch: rawDispatch };
    const merged = framebufIndexMergeProps(stateProps, dispatchProps, {});

    expect(merged.dispatch).toBe(rawDispatch);

    const thunk = (dispatch, getState) => {};
    merged.dispatch(thunk);
    expect(rawDispatch).toHaveBeenCalledWith(thunk);
    expect(rawDispatch).toHaveBeenCalledTimes(1);
  });

  test('ownProps and stateProps are preserved in the merged result', () => {
    const merged = framebufIndexMergeProps(
      { framebufIndex: 1, foo: 'bar' },
      { dispatch: jest.fn() },
      { ownThing: 42 },
    );
    expect(merged.ownThing).toBe(42);
    expect(merged.foo).toBe('bar');
    expect(merged.framebufIndex).toBe(1);
  });
});
