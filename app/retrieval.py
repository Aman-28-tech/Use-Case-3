import os
import re
import math
from collections import Counter
from typing import List, Dict, Any, Optional

STOPWORDS = {
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
    'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
    'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
    'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
    'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most',
    'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our',
    'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than',
    'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this',
    'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
    'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would'
}

class RetrievalAgent:
    """
    Section-Aware RAG Retrieval Agent per architecture.md Section 2.6.
    Splits policy documents by '##' headings into citable sections,
    builds a TF-IDF index over sections with category-scoped filtering,
    and returns exact 'file#section' citations or NO_EVIDENCE fallback.
    """
    CATEGORY_DOC_MAP = {
        "POS and Payments": ["02_pos_pricing_returns_policy.md", "01_retail_operations_sop.md"],
        "Pricing and Promotions": ["02_pos_pricing_returns_policy.md", "01_retail_operations_sop.md"],
        "Returns and Refunds": ["02_pos_pricing_returns_policy.md", "05_responsible_ai_policy.md", "01_retail_operations_sop.md"],
        "Inventory and Replenishment": ["03_inventory_replenishment_policy.md", "04_vendor_quality_policy.md", "01_retail_operations_sop.md"],
        "Vendor and Supply Chain": ["04_vendor_quality_policy.md", "03_inventory_replenishment_policy.md"],
        "Product Quality and Safety": ["04_vendor_quality_policy.md", "01_retail_operations_sop.md"],
        "Other or Security": ["05_responsible_ai_policy.md", "02_pos_pricing_returns_policy.md", "01_retail_operations_sop.md"],
        "Customer Service": ["01_retail_operations_sop.md", "02_pos_pricing_returns_policy.md"]
    }

    def __init__(self):
        self.sections = []
        self.doc_vectors = []
        self.idf = {}
        self.is_loaded = False
        self.load_knowledge_base()

    def _tokenize(self, text: str) -> List[str]:
        words = re.findall(r"\b[a-z0-9_]{2,}\b", text.lower())
        meaningful = [w for w in words if w not in STOPWORDS]
        tokens = list(meaningful)
        bigrams = [
            f"{words[i]}_{words[i+1]}"
            for i in range(len(words)-1)
            if words[i] not in STOPWORDS or words[i+1] not in STOPWORDS
        ]
        tokens.extend(bigrams)
        return tokens

    def load_knowledge_base(self):
        if self.is_loaded and len(self.sections) > 0:
            return

        candidate_dirs = [
            os.path.join(os.path.dirname(__file__), "..", "Use Case 3", "knowledge_base"),
            os.path.join(os.path.dirname(__file__), "..", "knowledge_base"),
            os.path.join(os.getcwd(), "Use Case 3", "knowledge_base"),
            os.path.join(os.getcwd(), "knowledge_base")
        ]

        kb_dir = None
        for d in candidate_dirs:
            if os.path.exists(d):
                kb_dir = d
                break

        if not kb_dir:
            print("[RetrievalAgent] Warning: knowledge_base directory not found.")
            return

        files = sorted([f for f in os.listdir(kb_dir) if f.endswith(".md")])
        self.sections = []

        for f in files:
            full_path = os.path.join(kb_dir, f)
            with open(full_path, "r", encoding="utf-8") as fp:
                lines = fp.readlines()

            current_header = "Overview"
            current_lines = []

            for line in lines:
                if line.startswith("## "):
                    if current_lines:
                        self._add_section(f, current_header, "".join(current_lines))
                    current_header = line.replace("## ", "").strip()
                    current_lines = [line]
                else:
                    current_lines.append(line)

            if current_lines:
                self._add_section(f, current_header, "".join(current_lines))

        self._build_index()
        self.is_loaded = True
        print(f"[RetrievalAgent] Indexed {len(self.sections)} sections from {kb_dir}")

    def _add_section(self, file_name: str, header_title: str, content: str):
        slug = re.sub(r"[^a-z0-9]+", "-", header_title.lower()).strip("-")
        citation = f"{file_name}#{slug}"
        # We give the header title triple weight in the indexed text
        weighted_text = f"{header_title} {header_title} {header_title} {content}"
        self.sections.append({
            "file_name": file_name,
            "header": header_title,
            "slug": slug,
            "citation": citation,
            "content": content.strip(),
            "raw_text": weighted_text
        })

    def _build_index(self):
        N = len(self.sections)
        df = Counter()
        self.doc_tokens = [self._tokenize(s["raw_text"]) for s in self.sections]
        for toks in self.doc_tokens:
            for t in set(toks):
                df[t] += 1
        self.idf = {t: math.log((N + 1) / (cnt + 1)) + 1.0 for t, cnt in df.items()}

        self.doc_vectors = []
        for toks in self.doc_tokens:
            counts = Counter(toks)
            tot = max(1, len(toks))
            vec = {}
            norm_sq = 0.0
            for t, cnt in counts.items():
                w = (cnt / tot) * self.idf.get(t, 1.0)
                vec[t] = w
                norm_sq += w * w
            norm = math.sqrt(norm_sq) if norm_sq > 0 else 1.0
            self.doc_vectors.append({t: w / norm for t, w in vec.items()})

    def retrieve(self, query_text: str, category: Optional[str] = None,
                 max_results: int = 3, threshold: float = 0.015) -> Dict[str, Any]:
        """
        Executes genuine section-aware TF-IDF retrieval.
        Applies category doc scoping, computes cosine similarity,
        and returns citations and passage snippets.
        """
        self.load_knowledge_base()
        q_toks = self._tokenize(query_text)
        if not q_toks:
            return {
                "citations": ["NO_EVIDENCE"],
                "snippets": [],
                "evidence_found": False,
                "best_snippet": None
            }

        counts = Counter(q_toks)
        tot = max(1, len(q_toks))
        q_vec = {}
        norm_sq = 0.0
        for t, cnt in counts.items():
            if t in self.idf:
                w = (cnt / tot) * self.idf[t]
                q_vec[t] = w
                norm_sq += w * w
        norm = math.sqrt(norm_sq) if norm_sq > 0 else 1.0
        q_vec = {t: w / norm for t, w in q_vec.items()}

        allowed_files = self.CATEGORY_DOC_MAP.get(category, []) if category else []

        scored = []
        for i, sec in enumerate(self.sections):
            # Category document filter per architecture §2.6
            if allowed_files and sec["file_name"] not in allowed_files:
                continue
            doc_vec = self.doc_vectors[i]
            score = sum(w * doc_vec.get(t, 0.0) for t, w in q_vec.items())
            if score >= threshold:
                scored.append((score, sec))

        # If scoped search yields nothing, search globally across all docs
        if not scored and allowed_files:
            for i, sec in enumerate(self.sections):
                doc_vec = self.doc_vectors[i]
                score = sum(w * doc_vec.get(t, 0.0) for t, w in q_vec.items())
                if score >= threshold:
                    scored.append((score, sec))

        scored.sort(key=lambda x: x[0], reverse=True)

        if not scored:
            return {
                "citations": ["NO_EVIDENCE"],
                "snippets": [],
                "evidence_found": False,
                "best_snippet": None
            }

        citations = []
        snippets = []
        for score, sec in scored[:max_results]:
            citations.append(sec["citation"])
            snippets.append({
                "citation": sec["citation"],
                "title": sec["header"],
                "text": sec["content"][:400] + "..." if len(sec["content"]) > 400 else sec["content"],
                "score": round(score, 4)
            })

        return {
            "citations": citations,
            "snippets": snippets,
            "evidence_found": True,
            "best_snippet": snippets[0]["text"] if snippets else None
        }

retrieval_agent = RetrievalAgent()
