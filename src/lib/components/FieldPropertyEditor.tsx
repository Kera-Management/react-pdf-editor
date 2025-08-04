import React, { useState, useEffect, useRef } from "react";
import { BuildModeField } from "../PDFEditor";
import styles from "./FieldPropertyEditor.module.css";

interface FieldPropertyEditorProps {
  field: BuildModeField | null;
  onUpdateField: (fieldId: string, updates: Partial<BuildModeField>) => void;
  onClose: () => void;
}

export const FieldPropertyEditor: React.FC<FieldPropertyEditorProps> = ({
  field,
  onUpdateField,
  onClose
}) => {
  const [localField, setLocalField] = useState<BuildModeField | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalField(field);
  }, [field]);

  if (!field || !localField) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return; // Only drag from header, not from inputs
    
    setIsDragging(true);
    const startX = e.clientX - position.x;
    const startY = e.clientY - position.y;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - startX,
        y: e.clientY - startY
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleInputChange = (key: keyof BuildModeField | string, value: unknown) => {
    if (!localField) return;

    if (key.startsWith('properties.')) {
      const propKey = key.replace('properties.', '');
      const updatedField = {
        ...localField,
        properties: {
          ...localField.properties,
          [propKey]: value
        }
      };
      setLocalField(updatedField);
      onUpdateField(localField.id, updatedField);
    } else {
      const updatedField = {
        ...localField,
        [key]: value
      };
      setLocalField(updatedField);
      onUpdateField(localField.id, updatedField);
    }
  };

  const handleOptionChange = (index: number, field: 'exportValue' | 'displayValue', value: string) => {
    if (!localField?.properties.options) return;
    
    const newOptions = [...localField.properties.options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    handleInputChange('properties.options', newOptions);
  };

  const addOption = () => {
    const newOptions = [...(localField?.properties.options || [])];
    newOptions.push({ exportValue: `option${newOptions.length + 1}`, displayValue: `Option ${newOptions.length + 1}` });
    handleInputChange('properties.options', newOptions);
  };

  const removeOption = (index: number) => {
    if (!localField?.properties.options) return;
    const newOptions = localField.properties.options.filter((_, i) => i !== index);
    handleInputChange('properties.options', newOptions);
  };

  return (
    <div 
      ref={modalRef}
      className={`${styles.editor} ${isDragging ? styles.dragging : ''}`}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        left: '50%',
        top: '50%',
        marginLeft: '-200px', // Half of width (400px / 2)
        marginTop: '-200px'   // Approximate half of height
      }}
    >
      <div 
        className={styles.header}
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <h3>Field Properties</h3>
        <button onClick={onClose} className={styles.closeButton}>×</button>
      </div>
      
      <div className={styles.content}>
        <div className={styles.section}>
          <label className={styles.label}>
            Field Name:
            <input
              type="text"
              value={localField.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={styles.input}
            />
          </label>
        </div>

        <div className={styles.section}>
          <h4>Position & Size</h4>
          <div className={styles.grid}>
            <label className={styles.label}>
              X:
              <input
                type="number"
                value={Math.round(localField.x)}
                onChange={(e) => handleInputChange('x', parseFloat(e.target.value) || 0)}
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              Y:
              <input
                type="number"
                value={Math.round(localField.y)}
                onChange={(e) => handleInputChange('y', parseFloat(e.target.value) || 0)}
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              Width:
              <input
                type="number"
                value={Math.round(localField.width)}
                onChange={(e) => handleInputChange('width', parseFloat(e.target.value) || 20)}
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              Height:
              <input
                type="number"
                value={Math.round(localField.height)}
                onChange={(e) => handleInputChange('height', parseFloat(e.target.value) || 20)}
                className={styles.input}
              />
            </label>
          </div>
        </div>

        <div className={styles.section}>
          <h4>Appearance</h4>
          <label className={styles.label}>
            Font Size:
            <input
              type="number"
              value={localField.properties.fontSize || 12}
              onChange={(e) => handleInputChange('properties.fontSize', parseFloat(e.target.value) || 12)}
              className={styles.input}
              min="6"
              max="72"
            />
          </label>
        </div>

        {(localField.type === 'text' || localField.type === 'multiline') && (
          <div className={styles.section}>
            <label className={styles.label}>
              Placeholder:
              <input
                type="text"
                value={localField.properties.placeholder || ''}
                onChange={(e) => handleInputChange('properties.placeholder', e.target.value)}
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              Default Value:
              <input
                type="text"
                value={localField.properties.defaultValue || ''}
                onChange={(e) => handleInputChange('properties.defaultValue', e.target.value)}
                className={styles.input}
              />
            </label>
          </div>
        )}

        {(localField.type === 'dropdown' || localField.type === 'radio') && (
          <div className={styles.section}>
            <h4>Options</h4>
            {localField.properties.options?.map((option, index) => (
              <div key={index} className={styles.optionRow}>
                <input
                  type="text"
                  placeholder="Display value"
                  value={option.displayValue}
                  onChange={(e) => handleOptionChange(index, 'displayValue', e.target.value)}
                  className={styles.input}
                />
                <input
                  type="text"
                  placeholder="Export value"
                  value={option.exportValue}
                  onChange={(e) => handleOptionChange(index, 'exportValue', e.target.value)}
                  className={styles.input}
                />
                <button
                  onClick={() => removeOption(index)}
                  className={styles.removeButton}
                  title="Remove option"
                >
                  −
                </button>
              </div>
            ))}
            <button onClick={addOption} className={styles.addButton}>
              + Add Option
            </button>
          </div>
        )}

        <div className={styles.section}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={localField.properties.required || false}
              onChange={(e) => handleInputChange('properties.required', e.target.checked)}
            />
            Required field
          </label>
        </div>
      </div>
    </div>
  );
};

export default FieldPropertyEditor;