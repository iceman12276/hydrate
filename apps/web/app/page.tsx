import { APP_NAME, mlToOz } from '@hydrate/shared'

export default function Home() {
  return (
    <main>
      <h1>{APP_NAME}</h1>
      <p>Multiplatform water tracker &amp; reminder — web shell (M0 scaffold).</p>
      <p>
        Shared logic check: <code>mlToOz(500)</code> = {mlToOz(500).toFixed(1)} fl oz
      </p>
    </main>
  )
}
