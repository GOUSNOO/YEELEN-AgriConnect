import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  Card, Button, Field, Select, Badge, MiniChart,
  ToastContainer, notifyError, notifySuccess,
} from './ui.jsx';

describe('Card', () => {
  test('transmet onClick et les props DOM au <div> (régression documentée)', () => {
    const onClick = jest.fn();
    render(<Card onClick={onClick} data-testid="carte" aria-label="ma carte">contenu</Card>);
    const el = screen.getByTestId('carte');
    expect(el).toHaveAttribute('aria-label', 'ma carte');
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(el).toHaveTextContent('contenu');
  });
});

describe('Button', () => {
  test('type par défaut = button', () => {
    render(<Button>ok</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  test('disabled : clic bloqué et curseur not-allowed', () => {
    const onClick = jest.fn();
    render(<Button disabled onClick={onClick}>x</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(btn).toHaveStyle({ cursor: 'not-allowed' });
  });

  test('les variantes produisent un fond différent', () => {
    const { rerender } = render(<Button variant="green">g</Button>);
    const bgGreen = screen.getByRole('button').style.background;
    rerender(<Button variant="danger">d</Button>);
    expect(screen.getByRole('button').style.background).not.toBe(bgGreen);
  });
});

describe('Field / Select', () => {
  test('Field rend le label et transmet value/onChange/placeholder', () => {
    const onChange = jest.fn();
    render(<Field label="Nom" placeholder="Jean" value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('Jean');
    expect(screen.getByText('Nom')).toBeInTheDocument();
    expect(input).toHaveClass('flat-input');
    fireEvent.change(input, { target: { value: 'a' } });
    expect(onChange).toHaveBeenCalled();
  });

  test('Field fusionne className avec flat-input', () => {
    render(<Field label="X" className="perso" />);
    expect(screen.getByRole('textbox')).toHaveClass('flat-input', 'perso');
  });

  test("AideChamp n'apparaît que si `aide` est fourni, et le tooltip s'ouvre au clic", () => {
    const { rerender } = render(<Field label="Sans aide" />);
    expect(screen.queryByRole('button', { name: /aide sur ce champ/i })).not.toBeInTheDocument();

    rerender(<Field label="Avec aide" aide="Explication du champ" />);
    const helpBtn = screen.getByRole('button', { name: /aide sur ce champ/i });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(helpBtn);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Explication du champ');
  });

  test('Select rend ses <option> et transmet value', () => {
    render(
      <Select label="Type" value="b" onChange={() => {}}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    );
    expect(screen.getByRole('combobox')).toHaveValue('b');
    expect(screen.getByRole('option', { name: 'A' })).toBeInTheDocument();
  });
});

describe('Badge', () => {
  test('un ton inconnu retombe sur le style « green »', () => {
    const { rerender } = render(<Badge tone="green">g</Badge>);
    const green = screen.getByText('g').style.background;
    rerender(<Badge tone="inconnu">g2</Badge>);
    expect(screen.getByText('g2').style.background).toBe(green);
  });
});

describe('MiniChart', () => {
  test('« Aucune donnée » si data vide', () => {
    render(<MiniChart data={[]} color="#000" />);
    expect(screen.getByText(/Aucune donnée/i)).toBeInTheDocument();
  });
  test('une barre par point de données', () => {
    render(<MiniChart data={[{ label: 'L', value: 3 }, { label: 'M', value: 5 }, { label: 'M2', value: 1 }]} color="#000" />);
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('M2')).toBeInTheDocument();
  });
});

describe('Toasts', () => {
  test('notifySuccess affiche un message, retiré au clic sur ✕', () => {
    render(<ToastContainer />);
    expect(screen.queryByText('Enregistré !')).not.toBeInTheDocument();
    act(() => notifySuccess('Enregistré !'));
    expect(screen.getByText('Enregistré !')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(screen.queryByText('Enregistré !')).not.toBeInTheDocument();
  });

  test('notifyError utilise err.message, sinon le fallback', () => {
    render(<ToastContainer />);
    act(() => notifyError(new Error('Boom réseau')));
    expect(screen.getByText('Boom réseau')).toBeInTheDocument();
    act(() => notifyError(null, 'Repli explicite'));
    expect(screen.getByText('Repli explicite')).toBeInTheDocument();
  });
});
