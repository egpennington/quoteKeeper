import CreatableSelect from 'react-select/creatable'

const tagOptions = [
  { value: 'motivation', label: 'Motivation' },
  { value: 'leadership', label: 'Leadership' },
  { value: 'loss', label: 'Loss' },
  { value: 'wisdom', label: 'Wisdom' },
  { value: 'courage', label: 'Courage' },
  { value: 'humor', label: 'Humor' },
  { value: 'faith', label: 'Faith' },
  { value: 'growth', label: 'Growth' },
  { value: 'resilience', label: 'Resilience' },
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
  { value: 'life', label: 'Life' },
  { value: 'kindness', label: 'Kindness' },
  { value: 'inspiration', label: 'Inspiration' },
  { value: 'fear', label: 'Fear' },
  { value: 'strength', label: 'Strength' },
  { value: 'change', label: 'Change' },
  { value: 'gratitude', label: 'Gratitude' },
  { value: 'truth', label: 'Truth' },
  { value: 'perseverance', label: 'Perseverance' },
  { value: 'dreams', label: 'Dreams' },
  { value: 'patience', label: 'Patience' },
  { value: 'peace', label: 'Peace' },
  { value: 'mindfulness', label: 'Mindfulness' },
  { value: 'freedom', label: 'Freedom' },
  { value: 'learning', label: 'Learning' },
  { value: 'vision', label: 'Vision' },
  { value: 'joy', label: 'Joy' },
]

export default function TagSelect({ selectedTags, setSelectedTags }) {
  return (
    <CreatableSelect
      isMulti
      options={tagOptions}
      value={selectedTags}
      onChange={setSelectedTags}
      placeholder="Select or type a tag..."
    />
  )
}
