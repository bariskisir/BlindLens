/** Adapts interview's named system prompt selection and editing workflow for screen descriptions. */

import { useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Select, Space } from 'antd'
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MAX_SYSTEM_PROMPTS, type SystemPrompt } from '@shared/lens'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useAccentButtonProps } from '@renderer/hooks/useAccentButtonProps'
import { useAppSelector } from '@renderer/store'
import { promptLabel } from '@renderer/utils/promptLabel'
import SettingRow from '../components/SettingRow'
import { cx } from '@renderer/utils/classNames'
import styles from '../SettingsPage.module.scss'

/** Manages reusable prompts while keeping the selected prompt valid after deletion. */
const PromptsSettingsSection = (): React.JSX.Element => {
  const { t } = useTranslation()
  const settings = useAppSelector((state) => state.app.settings)
  const { saveSettings } = useSettingsActions()
  const accent = useAccentButtonProps()
  const [editing, setEditing] = useState<SystemPrompt | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ name: string; text: string }>()
  const selected = settings.systemPrompts.find(
    (prompt) => prompt.id === settings.systemPromptPreset,
  )
  /** Opens a prompt draft without changing persisted preferences. */
  const edit = (prompt?: SystemPrompt, duplicate = false): void => {
    const draft = {
      id: duplicate || !prompt ? crypto.randomUUID() : prompt.id,
      name: prompt?.name ?? '',
      text: prompt?.text ?? '',
      isBuiltIn: false,
    }
    setEditing(draft)
    form.setFieldsValue(draft)
  }
  /** Commits one validated prompt and selects it after a successful save. */
  const save = async (): Promise<void> => {
    if (!editing) return
    const values = await form.validateFields().catch(() => null)
    if (!values) return
    setSaving(true)
    try {
      const prompt = {
        id: editing.id,
        name: values.name.trim(),
        text: values.text.trim(),
        isBuiltIn: false,
      }
      const existing = settings.systemPrompts.some((item) => item.id === prompt.id)
      const systemPrompts = existing
        ? settings.systemPrompts.map((item) => (item.id === prompt.id ? prompt : item))
        : [...settings.systemPrompts, prompt]
      if (await saveSettings({ systemPrompts, systemPromptPreset: prompt.id })) setEditing(null)
    } finally {
      setSaving(false)
    }
  }
  /** Removes the selected prompt and atomically selects the first remaining entry. */
  const remove = async (): Promise<void> => {
    if (!selected || selected.isBuiltIn) return
    const systemPrompts = settings.systemPrompts.filter((prompt) => prompt.id !== selected?.id)
    if (systemPrompts[0])
      await saveSettings({ systemPrompts, systemPromptPreset: systemPrompts[0].id })
  }
  return (
    <div className={cx(styles.settingContainer)}>
      <h2 className={cx(styles.groupTitle)}>{t('lens.prompts')}</h2>
      <section className={cx(styles.settingGroup)}>
        <SettingRow title={t('lens.activePrompt')} description={t('lens.promptDescription')}>
          <Select
            aria-label={t('lens.activePrompt')}
            className={cx(styles.wideControl)}
            value={settings.systemPromptPreset}
            options={settings.systemPrompts.map((prompt) => ({
              value: prompt.id,
              label: promptLabel(prompt, t),
            }))}
            onChange={(systemPromptPreset: string) => void saveSettings({ systemPromptPreset })}
          />
        </SettingRow>
        <Space wrap className={cx(styles.promptActions)}>
          <Button
            {...accent}
            icon={<Plus size={15} />}
            disabled={settings.systemPrompts.length >= MAX_SYSTEM_PROMPTS}
            onClick={() => edit()}
          >
            {t('lens.addPrompt')}
          </Button>
          {selected && !selected.isBuiltIn && (
            <Button icon={<Pencil size={15} />} onClick={() => edit(selected)}>
              {t('lens.editPrompt')}
            </Button>
          )}
          <Button
            icon={<Copy size={15} />}
            disabled={!selected || settings.systemPrompts.length >= MAX_SYSTEM_PROMPTS}
            onClick={() => edit(selected, true)}
          >
            {t('lens.duplicate')}
          </Button>
          {selected && !selected.isBuiltIn && (
            <Popconfirm
              title={t('lens.deletePrompt')}
              onConfirm={() => void remove()}
              okText={t('common.delete')}
              cancelText={t('common.cancel')}
            >
              <Button
                danger
                icon={<Trash2 size={15} />}
                disabled={settings.systemPrompts.length < 2}
              >
                {t('common.delete')}
              </Button>
            </Popconfirm>
          )}
        </Space>
        <pre className={cx(styles.promptText)}>{selected?.text}</pre>
        {selected?.isBuiltIn && <p className={cx(styles.note)}>{t('lens.builtInPrompt')}</p>}
      </section>
      <Modal
        title={t('lens.editPrompt')}
        open={editing !== null}
        onCancel={() => setEditing(null)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText={t('lens.save')}
        cancelText={t('common.cancel')}
        width={720}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('lens.promptName')}
            rules={[{ required: true, whitespace: true, max: 100 }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="text"
            label={t('lens.promptText')}
            rules={[{ required: true, whitespace: true, max: 16000 }]}
          >
            <Input.TextArea rows={12} maxLength={16000} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PromptsSettingsSection
