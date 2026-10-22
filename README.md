# App del gym · Samuel, Anderson y Lorena

App de un solo archivo (`index.html`, sin build). Los datos se guardan en Supabase y se sincronizan en vivo entre los celulares.

## 1. Base de datos (Supabase, gratis)
1. Crea un proyecto en https://supabase.com (región São Paulo, la más cercana a Bogotá).
2. SQL Editor → New query → pega `schema.sql` → **Run** (se puede correr varias veces sin error).
   La última consulta del script debe devolver una fila con `kv` (tabla en la publicación `supabase_realtime`).
3. Project Settings → API → copia **Project URL** y la llave **anon public** (nunca la `service_role`).
4. Abre `index.html` y pégalas en `SB_URL` y `SB_KEY` (al inicio del script).

## 2. Publicar en GitHub Pages
1. Crea un repositorio **público** (ej. `gym-equipo`) y sube `index.html`.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `root` → Save.
3. En 1–2 minutos queda en: `https://TU_USUARIO.github.io/gym-equipo/`

## 3. Usar
- Manda el link a Anderson y Lorena. Cada uno elige su nombre arriba.
- Arriba debe decir **"Progreso compartido: se guarda para los tres"**.
- **Unidades**: en cada ejercicio, junto al nombre de cada persona, se elige `kg | lb | placas`.
  Si cambias de unidad con historial, la meta se convierte sola (1 lb = 0,4536 kg) a una carga que se pueda armar.
- **Plan → Mi gym** (compartido para los tres): unidad preferida de cada uno, peso de las barras,
  discos disponibles, rango y salto de las mancuernas, y cuánto pesa cada placa en las máquinas.
  Con esto la app calcula los discos por lado ("Por lado: 20 + 5 + 1,25") y convierte placas a kg para el volumen.
- Para pasar lo que ya registraste: en la versión vieja, Progreso → *Descargar app con el progreso*;
  en la nueva, Progreso → *Importar progreso de otro archivo*. El archivo lleva también la configuración de Mi gym.
- En el celular: menú del navegador → *Agregar a pantalla de inicio*.

## Actualizar la app
1. Edita `index.html` (o pídele los cambios a Claude).
2. `git add index.html && git commit -m "Describe el cambio" && git push`
3. GitHub Pages publica solo en 1–2 minutos. Los datos viven en Supabase, no se pierden.

## Notas
- La llave `anon` es pública por diseño; cualquiera con el link puede escribir. Para datos de gym está bien;
  no compartas el link fuera del equipo. No pongas nunca la `service_role` en el repo.
- Proyectos gratis de Supabase se pausan tras 7 días sin uso; si pasa, entra al panel y dale *Restore*.
- Los datos viejos (sin unidad) se leen como kg; no hay que migrar nada.
