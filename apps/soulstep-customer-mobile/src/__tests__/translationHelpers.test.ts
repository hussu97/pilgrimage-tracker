describe('religion translation key mapping', () => {
  const RELIGIONS = [
    { value: '', labelKey: 'common.all' },
    { value: 'islam', labelKey: 'common.islam' },
    { value: 'christianity', labelKey: 'common.christianity' },
    { value: 'hinduism', labelKey: 'common.hinduism' },
    { value: 'buddhism', labelKey: 'common.buddhism' },
    { value: 'sikhism', labelKey: 'common.sikhism' },
    { value: 'judaism', labelKey: 'common.judaism' },
    { value: 'bahai', labelKey: 'common.bahai' },
    { value: 'zoroastrianism', labelKey: 'common.zoroastrianism' },
  ];

  function religionToKey(religion: string): string {
    return `common.${religion}`;
  }

  function placeTypeToKey(placeType: string): string {
    return `common.place_type.${placeType}`;
  }

  it('maps religion value to translation key', () => {
    expect(religionToKey('islam')).toBe('common.islam');
    expect(religionToKey('hinduism')).toBe('common.hinduism');
    expect(religionToKey('buddhism')).toBe('common.buddhism');
    expect(religionToKey('sikhism')).toBe('common.sikhism');
  });

  it('RELIGIONS array has labelKey for each entry', () => {
    for (const r of RELIGIONS) {
      expect(r.labelKey).toMatch(/^common\./);
    }
  });

  it('maps place type to translation key', () => {
    expect(placeTypeToKey('mosque')).toBe('common.place_type.mosque');
    expect(placeTypeToKey('temple')).toBe('common.place_type.temple');
  });

  it('falls back to original value when translation missing', () => {
    const t = (key: string): string => {
      const translations: Record<string, string> = {
        'common.islam': 'الإسلام',
      };
      return translations[key] || '';
    };
    const religion = 'islam';
    expect(t(`common.${religion}`) || religion).toBe('الإسلام');

    const unknownReligion = 'unknown_faith';
    expect(t(`common.${unknownReligion}`) || unknownReligion).toBe('unknown_faith');
  });
});
