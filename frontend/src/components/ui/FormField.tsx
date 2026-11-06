import { cloneElement, useId, type InputHTMLAttributes, type ReactElement, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

type FormFieldProps = {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactElement
  className?: string
}

export function FormField({ label, htmlFor, hint, error, required, children, className = '' }: FormFieldProps) {
  const generatedId = useId()
  const hintId = hint ? `${generatedId}-hint` : undefined
  const errorId = error ? `${generatedId}-error` : undefined
  const isRequired = required ?? Boolean((children.props as { required?: boolean }).required)

  return (
    <div className={`grid min-w-0 gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}{isRequired && <span aria-hidden="true" className="ml-1 text-destructive">*</span>}
      </label>
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: htmlFor,
        required: isRequired || undefined,
        'aria-required': isRequired || undefined,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && <p id={hintId} className="text-sm text-muted-foreground">{hint}</p>}
      {error && <p id={errorId} className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  )
}

const controlClasses = 'min-h-11 min-w-0 w-full rounded-lg border border-border bg-card px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50'

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }

export function TextInput({ invalid = false, className = '', ...props }: TextInputProps) {
  return (
    <input
      className={`${controlClasses} ${invalid ? 'border-destructive focus-visible:outline-destructive' : ''} ${className}`}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }

export function TextArea({ invalid = false, className = '', ...props }: TextAreaProps) {
  return (
    <textarea
      className={`${controlClasses} min-h-24 resize-y ${invalid ? 'border-destructive focus-visible:outline-destructive' : ''} ${className}`}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }

export function SelectField({ invalid = false, className = '', children, ...props }: SelectFieldProps) {
  return (
    <select
      className={`${controlClasses} ${invalid ? 'border-destructive focus-visible:outline-destructive' : ''} ${className}`}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {children}
    </select>
  )
}
