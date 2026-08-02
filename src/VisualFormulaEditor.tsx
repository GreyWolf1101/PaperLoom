import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { MathfieldElement, type Selector } from "mathlive";
import "mathlive/fonts.css";

MathfieldElement.fontsDirectory = null;

export type VisualFormulaEditorHandle = {
  executeCommand: (command: Selector) => boolean;
  focus: () => void;
  getValue: () => string;
  insert: (latex: string) => boolean;
};

type VisualFormulaEditorProps = {
  value: string;
  placeholder: string;
  ariaLabel: string;
  onChange: (value: string) => void;
};

const VisualFormulaEditor = forwardRef<VisualFormulaEditorHandle, VisualFormulaEditorProps>(
  function VisualFormulaEditor({ value, placeholder, ariaLabel, onChange }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const fieldRef = useRef<MathfieldElement | null>(null);
    const changeRef = useRef(onChange);

    changeRef.current = onChange;

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const field = new MathfieldElement();
      field.className = "paperloom-mathfield";
      field.setAttribute("aria-label", ariaLabel);
      host.replaceChildren(field);
      fieldRef.current = field;

      field.defaultMode = "math";
      field.mathVirtualKeyboardPolicy = "manual";
      field.smartFence = true;
      field.smartMode = false;
      field.placeholder = placeholder;
      field.setValue(value, { silenceNotifications: true, selectionMode: "after" });

      const handleInput = () => changeRef.current(field.getValue("latex"));
      field.addEventListener("input", handleInput);

      return () => {
        field.removeEventListener("input", handleInput);
        fieldRef.current = null;
        field.remove();
      };
    }, [ariaLabel, placeholder]);

    useEffect(() => {
      const field = fieldRef.current;
      if (!field || field.getValue("latex") === value) return;
      field.setValue(value, { silenceNotifications: true, selectionMode: "after" });
    }, [value]);

    useImperativeHandle(ref, () => ({
      executeCommand: (command) => fieldRef.current?.executeCommand(command) ?? false,
      focus: () => fieldRef.current?.focus(),
      getValue: () => fieldRef.current?.getValue("latex") || "",
      insert: (latex) => fieldRef.current?.insert(latex, {
        format: "latex",
        insertionMode: "replaceSelection",
        selectionMode: "placeholder",
        focus: true,
        scrollIntoView: true,
      }) ?? false,
    }), []);

    return <div ref={hostRef} className="visual-formula-editor-host" />;
  },
);

export default VisualFormulaEditor;
