-- Kör i Supabase SQL Editor
-- Uppdaterar set_daily_word så den slumpar ett ord automatiskt
-- och admin bara kan SE dagens ord

CREATE OR REPLACE FUNCTION set_daily_word_auto()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chosen_word TEXT;
BEGIN
  -- Välj ett random ord som inte redan använts som daily
  chosen_word := (
    SELECT w.word FROM words w
    WHERE w.word NOT IN (SELECT word FROM daily_challenge)
    ORDER BY RANDOM()
    LIMIT 1
  );

  IF chosen_word IS NULL THEN
    RETURN json_build_object('error', 'No unused words left');
  END IF;

  INSERT INTO daily_challenge (word, date)
  VALUES (chosen_word, CURRENT_DATE)
  ON CONFLICT (date) DO NOTHING;

  RETURN json_build_object('success', true, 'word', chosen_word);
END;
$$;

-- Admin-funktion: visa dagens ord (kräver lösenord)
CREATE OR REPLACE FUNCTION get_daily_admin(p_admin_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  todays_word TEXT;
  solver_count INT;
BEGIN
  -- Byt DITT_ADMINLÖSENORD mot ditt riktiga lösenord
  IF p_admin_password != 'Pandis2.0' THEN
    RETURN json_build_object('error', 'Wrong password');
  END IF;

  -- Auto-generera dagens ord om det inte finns än
  IF NOT EXISTS (SELECT 1 FROM daily_challenge WHERE date = CURRENT_DATE) THEN
    PERFORM set_daily_word_auto();
  END IF;

  todays_word := (SELECT word FROM daily_challenge WHERE date = CURRENT_DATE);
  solver_count := (SELECT COUNT(*) FROM daily_solvers WHERE date = CURRENT_DATE);

  RETURN json_build_object(
    'word', todays_word,
    'date', CURRENT_DATE::text,
    'solvers', solver_count
  );
END;
$$;

-- Uppdatera get_daily_hint så den också auto-genererar om det saknas
CREATE OR REPLACE FUNCTION get_daily_hint()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  challenge_word TEXT;
  challenge_date DATE;
  solved_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM daily_challenge WHERE date = CURRENT_DATE) THEN
    PERFORM set_daily_word_auto();
  END IF;

  challenge_word := (SELECT word FROM daily_challenge WHERE date = CURRENT_DATE LIMIT 1);
  challenge_date := (SELECT date FROM daily_challenge WHERE date = CURRENT_DATE LIMIT 1);
  solved_count := (SELECT COUNT(*) FROM daily_solvers WHERE date = challenge_date);

  IF challenge_word IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'first_letter', upper(left(challenge_word, 1)),
    'length',       length(challenge_word),
    'date',         challenge_date::text,
    'solved_count', solved_count
  );
END;
$$;
