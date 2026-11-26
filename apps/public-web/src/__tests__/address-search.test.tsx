import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AddressSearchResult } from '@care-platform/shared';
import { AddressSearch, type AddressSearchLabels } from '@/components/map/address-search';
import en from '@/lib/i18n/dictionaries/en.json';

const labels: AddressSearchLabels = { ...en.addressSearch, precision: en.addressSearch.precision, next: en.addressSearch.next };
const found: AddressSearchResult = {
  mapSearchUnavailable: false,
  results: [
    { label: '42 Temple Road', detail: 'Nugegoda, Colombo District', latitude: 6.8655, longitude: 79.9001, precision: 'ADDRESS', source: 'MAP' },
    { label: 'Nugegoda', detail: 'Colombo', latitude: 6.8649, longitude: 79.8997, precision: 'TOWN', source: 'TOWNS' },
  ],
};

describe('AddressSearch', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const type = async (text: string) => {
    fireEvent.change(screen.getByLabelText(en.addressSearch.label), { target: { value: text } });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
  };

  it('searches once typing pauses, and picking a match tells the map and says what to do next', async () => {
    const search = jest.fn(async () => found);
    const onPick = jest.fn();
    render(<AddressSearch search={search} onPick={onPick} labels={labels} />);
    // Typed quickly: only the last words are searched.
    fireEvent.change(screen.getByLabelText(en.addressSearch.label), { target: { value: '42 Te' } });
    await type('42 Temple Road');
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('42 Temple Road');
    expect(screen.getByRole('option', { name: /42 Temple Road/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Nugegoda.*Town/ })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('option', { name: /42 Temple Road/ }));
    expect(onPick).toHaveBeenCalledWith(found.results[0]);
    expect(screen.getByText(en.addressSearch.next.ADDRESS)).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('can be used with the keyboard', async () => {
    const onPick = jest.fn();
    render(<AddressSearch search={async () => found} onPick={onPick} labels={labels} />);
    await type('Nugegoda');
    const box = screen.getByLabelText(en.addressSearch.label);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(found.results[1]);
    expect(screen.getByText(en.addressSearch.next.TOWN)).toBeInTheDocument();
  });

  it('waits for 3 letters, and says when nothing or only towns were found', async () => {
    const search = jest.fn(async (): Promise<AddressSearchResult> => ({ mapSearchUnavailable: true, results: [] }));
    render(<AddressSearch search={search} onPick={jest.fn()} labels={labels} />);
    await type('ab');
    expect(search).not.toHaveBeenCalled();
    await type('abc');
    expect(screen.getByText(en.addressSearch.noMatches)).toBeInTheDocument();
    expect(screen.getByText(en.addressSearch.mapSearchUnavailable)).toBeInTheDocument();
  });

  it('says so when the search fails', async () => {
    render(<AddressSearch search={async () => Promise.reject(new Error('down'))} onPick={jest.fn()} labels={labels} />);
    await type('Kandy');
    expect(screen.getByText(en.addressSearch.error)).toBeInTheDocument();
  });
});
