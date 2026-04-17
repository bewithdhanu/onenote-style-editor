import resolve from '@rollup/plugin-node-resolve';
import postcss from 'rollup-plugin-postcss';

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/index.js',
      format: 'esm',
      exports: 'named',
      sourcemap: true,
    },
    {
      file: 'dist/index.cjs',
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
    },
    {
      file: 'dist/onenote-editor.umd.js',
      format: 'umd',
      name: 'OneNoteEditor',
      exports: 'named',
      sourcemap: true,
    },
  ],
  plugins: [
    resolve(),
    postcss({
      inject: true,
      minimize: true,
    }),
  ],
};
