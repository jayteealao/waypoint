import { forwardRef, useId } from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

/**
 * Labelled text input with error and helper states.
 * Always renders a visible <label> — never label-less.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helperText, className = "", id: idProp, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = idProp ?? autoId;
  const descId = error ? `${inputId}-err` : helperText ? `${inputId}-hint` : undefined;

  return (
    <div className="wp-input-wrapper">
      <label htmlFor={inputId} className="wp-input-label">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-describedby={descId}
        aria-invalid={error ? "true" : undefined}
        className={`wp-input${error ? " wp-input--error" : ""} ${className}`}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-err`} role="alert" className="wp-input-error-msg">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${inputId}-hint`} className="wp-input-helper">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});
