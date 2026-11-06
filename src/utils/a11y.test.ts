import { buttonA11yProps } from './a11y';

describe('buttonA11yProps (D4)', () => {
  it('returns role=button and a positive tabIndex when enabled', () => {
    const props = buttonA11yProps(() => {});
    expect(props.role).toBe('button');
    expect(props.tabIndex).toBe(0);
    expect(props['aria-disabled']).toBeUndefined();
  });

  it('uses tabIndex=-1 and aria-disabled when disabled', () => {
    const props = buttonA11yProps(() => {}, { disabled: true });
    expect(props.tabIndex).toBe(-1);
    expect(props['aria-disabled']).toBe(true);
  });

  it('exposes aria-label and aria-pressed from options', () => {
    const props = buttonA11yProps(() => {}, { label: 'Force foreground', pressed: true });
    expect(props['aria-label']).toBe('Force foreground');
    expect(props['aria-pressed']).toBe(true);
  });

  it('omits aria-pressed when not provided', () => {
    const props = buttonA11yProps(() => {});
    expect(props['aria-pressed']).toBeUndefined();
  });

  it('Enter key invokes onClick and calls preventDefault', () => {
    const onClick = jest.fn();
    const props = buttonA11yProps(onClick);
    const event = { key: 'Enter', preventDefault: jest.fn() } as any;
    props.onKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalled();
  });

  it('other keys (e.g. Space) do not invoke onClick', () => {
    const onClick = jest.fn();
    const props = buttonA11yProps(onClick);
    const event = { key: ' ', preventDefault: jest.fn() } as any;
    props.onKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Enter does not invoke onClick when disabled', () => {
    const onClick = jest.fn();
    const props = buttonA11yProps(onClick, { disabled: true });
    const event = { key: 'Enter', preventDefault: jest.fn() } as any;
    props.onKeyDown(event);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Enter is a no-op when onClick is undefined (e.g. a disabled Save button)', () => {
    const props = buttonA11yProps(undefined);
    const event = { key: 'Enter', preventDefault: jest.fn() } as any;
    expect(() => props.onKeyDown(event)).not.toThrow();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
