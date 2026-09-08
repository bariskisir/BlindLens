/** Provides an explicit save boundary for editable shortcuts, model IDs, and voice IDs. */

import { useEffect, useState } from 'react'
import { AutoComplete, Button, Input, Space } from 'antd'
import { useTranslation } from 'react-i18next'

/** Editable text field backed by a persisted settings value. */
interface SavedTextInputProps {
  value: string
  label: string
  options?: { value: string; label: string }[] | undefined
  maxLength?: number
  /** Persists a complete text value and reports success. */
  onSave(value: string): Promise<boolean>
}

/** Keeps partially typed values local until the user explicitly saves them. */
const SavedTextInput = ({
  value,
  label,
  options,
  maxLength = 200,
  onSave,
}: SavedTextInputProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(value), [value])
  /** Persists the draft while preventing overlapping save clicks. */
  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave(draft.trim())
    } finally {
      setSaving(false)
    }
  }
  return (
    <Space.Compact style={{ width: 300, maxWidth: '100%' }}>
      {options ? (
        <AutoComplete
          value={draft}
          options={options}
          onChange={setDraft}
          style={{ flex: 1, minWidth: 0 }}
          filterOption={(input, option) =>
            `${option?.label} ${option?.value}`.toLowerCase().includes(input.toLowerCase())
          }
        >
          <Input aria-label={label} maxLength={maxLength} onPressEnter={() => void save()} />
        </AutoComplete>
      ) : (
        <Input
          value={draft}
          aria-label={label}
          maxLength={maxLength}
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={() => void save()}
        />
      )}
      <Button loading={saving} disabled={draft.trim() === value} onClick={() => void save()}>
        {t('lens.save')}
      </Button>
    </Space.Compact>
  )
}

export default SavedTextInput
