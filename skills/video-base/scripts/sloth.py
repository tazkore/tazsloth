"""
Alias de compatibilidad: este módulo pasó a llamarse `vid.py` (Fase 2 de v!d). `from sloth import ...` sigue andando
para los estilos y scripts de antes; los nuevos usan `from vid import ...`.
"""

import sys

import vid

sys.modules[__name__] = vid
